/**
 * The function the panel injects into the tab with `chrome.scripting.executeScript`, in the
 * extension's isolated world and the top frame only. Chrome sends it as source text, so it
 * uses nothing but its arguments and the page's DOM: every helper is declared inside it.
 *
 * It returns the visible text and the actionable elements, and never the value of any form
 * field (plan rule 12): text inside inputs, text areas, selects and editable regions is
 * skipped, `.value` is never read, and an element's name comes from its label, never from
 * what was typed. Page-written roles and names describe; nothing decides on them (rule 8).
 *
 * It also keeps the snapshot in the isolated world, under `limits.snapshotKey`: the listed
 * elements in ref order, their role and name, and the reader that named them. A later click
 * or type (pageAct.ts) finds its element there, never by anything the page can write, and
 * names it again with the same reader. The page's own scripts cannot see the isolated
 * world, and Chrome drops it with the document, so a new page holds no snapshot.
 */
import type {
  CollectorLimits,
  KeptSnapshot,
  PageReader,
} from "./keptSnapshot.ts";

/** What the collector returns; the panel validates it with `readCollectedPage` and cuts it in snapshot.ts. */
export type CollectedPage = {
  /** The page's own `location.origin`, which a page cannot change: the panel checks it against the ruled origin. */
  origin: string;
  text: string;
  elements: Array<{ role: string; name: string }>;
};

/** Collects the page and keeps its snapshot as `snapshotId`. Runs in the tab, not in the panel. */
export function collectPage(
  limits: CollectorLimits,
  snapshotId: string,
): CollectedPage {
  const SKIP = limits.rules.skip;
  const TEXT_ENTRY_ROLES = new Set(limits.rules.textEntryRoles);
  const NAMED_BY_CONTENT = new Set(limits.rules.namedByContent);

  /** A reader with empty caches: what is visible now, not at the last read. */
  function makeReader() {
    const visibility = new Map<Element, boolean>();
    const masking = new Map<Element, boolean>();

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

    /** Whether the page masks this element's text like a password (`-webkit-text-security`, which inherits). */
    function isMasked(element: Element): boolean {
      const known = masking.get(element);
      if (known !== undefined) {
        return known;
      }
      const security = getComputedStyle(element).getPropertyValue(
        "-webkit-text-security",
      );
      const masked = !!security && security !== "none";
      masking.set(element, masked);
      return masked;
    }

    /** The visible text under a node, skipping form fields and masked text, up to `budget` units. */
    function visibleText(root: Node, budget: number): string {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const parts: Array<string> = [];
      let length = 0;

      for (let node = walker.nextNode(); node && length < budget;) {
        const parent = node.parentElement;
        const text = node.nodeValue ?? "";
        if (
          parent &&
          text.trim() &&
          !parent.closest(SKIP) &&
          isVisible(parent) &&
          !isMasked(parent)
        ) {
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
        TEXT_ENTRY_ROLES.has(role) ? "" : element.getAttribute("title"),
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

    const reader: PageReader = { isVisible, roleOf, nameOf };
    return { ...reader, visibleText };
  }

  const reader = makeReader();
  const body = document.body;
  const listed = body
    ? Array.from(body.querySelectorAll(limits.rules.actionable))
        .filter(reader.isVisible)
        .slice(0, limits.elementsMax)
    : [];
  const elements = listed.map((element) => {
    const role = reader.roleOf(element);
    return { role, name: reader.nameOf(element, role) };
  });
  const kept: KeptSnapshot = {
    id: snapshotId,
    elements: listed,
    described: elements,
    reader: makeReader,
  };
  Reflect.set(globalThis, limits.snapshotKey, kept);

  return {
    origin: location.origin,
    text: body ? reader.visibleText(body, limits.textBudget) : "",
    elements,
  };
}
