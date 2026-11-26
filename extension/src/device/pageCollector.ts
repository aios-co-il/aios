/**
 * The function the panel injects into the tab with `chrome.scripting.executeScript`, in the
 * extension's isolated world and the top frame only. Chrome sends it as source text, so it
 * uses nothing but its arguments and the page's DOM: every helper is declared inside it.
 *
 * It returns the visible text and the actionable elements, and never the value of any form
 * field (plan rule 12): text inside inputs, text areas, selects and editable regions is
 * skipped, `.value` is never read, and an element's name comes from its label, never from
 * what was typed. Page-written roles and names describe; nothing decides on them (rule 8).
 */

/** What the collector returns; the panel validates it with `readCollectedPage` and cuts it in snapshot.ts. */
export type CollectedPage = {
  text: string;
  elements: Array<{ role: string; name: string }>;
};

/** What the panel passes in, so the injected source holds no constants of its own. */
export type CollectorLimits = {
  /** Stop collecting text past this many UTF-16 units; the panel cuts to the contract's limit. */
  textBudget: number;
  elementsMax: number;
  nameBudget: number;
};

/** Collects the page. Runs in the tab, not in the panel. */
export function collectPage(limits: CollectorLimits): CollectedPage {
  // Never read: form fields and editable regions hold what the user typed; the rest is not text.
  const SKIP =
    "script,style,noscript,template,head,input,textarea,select,option,datalist,[contenteditable]:not([contenteditable='false'])";
  const ACTIONABLE =
    "a[href],button,input:not([type='hidden']),select,textarea,[role='button'],[role='link'],[role='checkbox'],[role='radio'],[role='tab'],[role='menuitem'],[role='textbox'],[role='combobox'],[role='switch'],[contenteditable]:not([contenteditable='false'])";
  const NAMED_BY_CONTENT = new Set(["link", "button", "tab", "menuitem"]);

  const visibility = new Map<Element, boolean>();

  /** Whether the element is rendered and not hidden; Chrome's own check, with a fallback without layout. */
  function isVisible(element: Element): boolean {
    const known = visibility.get(element);
    if (known !== undefined) {
      return known;
    }
    const visible =
      !element.closest("[hidden]") &&
      (typeof element.checkVisibility !== "function" ||
        // The option names Chrome 120, the manifest's minimum, knows; later versions keep them.
        element.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        }));
    visibility.set(element, visible);
    return visible;
  }

  /** The visible text under a node, skipping form fields, up to `budget` units. */
  function visibleText(root: Node, budget: number): string {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const parts: Array<string> = [];
    let length = 0;

    for (let node = walker.nextNode(); node && length < budget;) {
      const parent = node.parentElement;
      const text = node.nodeValue ?? "";
      if (parent && text.trim() && !parent.closest(SKIP) && isVisible(parent)) {
        parts.push(text);
        length += text.length + 1;
      }
      node = walker.nextNode();
    }
    return parts.join(" ");
  }

  /** The role a page gives an element, or the one its tag implies. */
  function roleOf(element: Element): string {
    const given = element.getAttribute("role");
    if (given) {
      return given;
    }
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    const implied: Record<string, string> = {
      a: "link",
      button: "button",
      select: "combobox",
      textarea: "textbox",
    };
    if (tag === "input") {
      return ["checkbox", "radio", "range"].includes(type)
        ? type
        : ["button", "submit", "reset", "image"].includes(type)
          ? "button"
          : "textbox";
    }
    return implied[tag] ?? "textbox";
  }

  /** A name from labels and attributes only; links and buttons also by their visible text. */
  function nameOf(element: Element, role: string): string {
    const labelled = element.getAttribute("aria-labelledby");
    const byIds = labelled
      ? labelled
          .split(/\s+/)
          .map((id) => document.getElementById(id))
          .filter((found): found is HTMLElement => found !== null)
          .map((found) => visibleText(found, limits.nameBudget))
          .join(" ")
      : "";
    const labels =
      "labels" in element && element.labels instanceof NodeList
        ? Array.from(element.labels, (label) =>
            visibleText(label, limits.nameBudget),
          ).join(" ")
        : "";
    const editable = element.matches(SKIP);
    const candidates = [
      element.getAttribute("aria-label"),
      byIds,
      labels,
      element.getAttribute("placeholder"),
      element.getAttribute("title"),
      element.getAttribute("alt"),
      NAMED_BY_CONTENT.has(role) && !editable
        ? visibleText(element, limits.nameBudget)
        : "",
    ];

    return (candidates.find((name) => name && name.trim()) ?? "").slice(
      0,
      limits.nameBudget,
    );
  }

  const body = document.body;
  const elements = body
    ? Array.from(body.querySelectorAll(ACTIONABLE))
        .filter(isVisible)
        .slice(0, limits.elementsMax)
        .map((element) => {
          const role = roleOf(element);
          return { role, name: nameOf(element, role) };
        })
    : [];

  return {
    text: body ? visibleText(body, limits.textBudget) : "",
    elements,
  };
}

/** The collector's answer, read as untrusted: null unless it has the collector's shape. */
export function readCollectedPage(value: unknown): CollectedPage | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("text" in value) ||
    typeof value.text !== "string" ||
    !("elements" in value) ||
    !Array.isArray(value.elements)
  ) {
    return null;
  }
  const elements = value.elements.filter(isCollectedElement);

  return elements.length === value.elements.length
    ? {
        text: value.text,
        elements: elements.map(({ role, name }) => ({ role, name })),
      }
    : null;
}

/** Narrows one collected element: a role and a name, both strings. */
function isCollectedElement(
  value: unknown,
): value is CollectedPage["elements"][number] {
  return (
    !!value &&
    typeof value === "object" &&
    "role" in value &&
    typeof value.role === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}
