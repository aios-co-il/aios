/**
 * The function the panel injects to click or type (AIO-656), in the extension's isolated
 * world and the top frame only, like the collector: Chrome sends it as source text, so it
 * uses nothing but its argument, the page's DOM and the snapshot the read kept there
 * (keptSnapshot.ts). It runs twice per step: before the card, to describe the element, and
 * after the tap, to check it is still that element and act.
 *
 * The element is the one the read listed under the ref, found in the isolated world and
 * never by anything the page can write. It must still be connected, carry the role and
 * name the read reported, be visible, and be the topmost element at its centre (so a
 * layer the page lays over it is caught), and after the tap everything the card was drawn
 * from must be unchanged. It never reads a field's value: typing sets it, and the facts it
 * returns about fields are their attributes and labels. The events themselves come from
 * pageInput.ts, which the panel installs in the same isolated world first.
 */
import type { FieldFacts } from "../../../supabase/functions/_shared/carmen/device/field-rule.ts";
import type {
  KeptSnapshot,
  PageActAnswer,
  PageActRequest,
  PageInput,
  TargetChange,
} from "./keptSnapshot.ts";

/** Describes the element, or checks it again and acts. Runs in the tab, not in the panel. */
export function actOnPage(request: PageActRequest): PageActAnswer {
  const { textTypes: TEXT_TYPES, fields: FIELDS } = request.rules;
  // Own properties only: an element with that id would answer through the window's
  // named properties, which the page controls.
  const kept: Partial<KeptSnapshot> | undefined =
    Object.getOwnPropertyDescriptor(globalThis, request.snapshotKey)?.value;

  /** The facts of a field the field rule reads: attributes, never the value. */
  function fieldFacts(element: Element, label: string): FieldFacts {
    return {
      type: element.getAttribute("type"),
      autocomplete: element.getAttribute("autocomplete"),
      names: [
        element.getAttribute("name"),
        element.getAttribute("id"),
        element.getAttribute("aria-label"),
        element.getAttribute("placeholder"),
        label,
      ],
    };
  }

  /** Whether typing can fill the element. */
  function isTextEntry(element: Element): boolean {
    if (element instanceof HTMLTextAreaElement) {
      return !element.disabled && !element.readOnly;
    }
    if (element instanceof HTMLInputElement) {
      const type = (element.getAttribute("type") ?? "").trim().toLowerCase();
      return (
        TEXT_TYPES.includes(type) && !element.disabled && !element.readOnly
      );
    }
    return element instanceof HTMLElement && element.isContentEditable;
  }

  /** Where a click on the element leads: a link's address, or a submit button's form address. */
  function destinationOf(element: Element): string | null {
    const link = element.closest("a[href]");
    if (link instanceof HTMLAnchorElement) {
      return link.href;
    }
    const submits =
      (element instanceof HTMLButtonElement && element.type === "submit") ||
      (element instanceof HTMLInputElement &&
        ["submit", "image"].includes(element.type));
    if (!submits || !element.form) {
      return null;
    }
    // A button's own `formaction` overrides its form's address. The form's is read through
    // the prototype's getter: a field named "action" would answer `form.action` instead.
    if (element.hasAttribute("formaction")) {
      return element.formAction;
    }
    const action = Object.getOwnPropertyDescriptor(
      HTMLFormElement.prototype,
      "action",
    )?.get?.call(element.form);
    return typeof action === "string" ? action : null;
  }

  /** The topmost element at the centre of the element's box, when it is the element or inside it. */
  function hitAtCentre(element: Element, rect: DOMRect): Element | null {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (
      rect.width < 1 ||
      rect.height < 1 ||
      x < 0 ||
      y < 0 ||
      x > innerWidth ||
      y > innerHeight
    ) {
      return null;
    }
    const hit = document.elementFromPoint(x, y);
    return hit && element.contains(hit) ? hit : null;
  }

  /** A change the step stops at. */
  function changed(reason: TargetChange): PageActAnswer {
    return { kind: "changed", reason };
  }

  const element = kept?.elements?.[request.index];
  const described = kept?.described?.[request.index];
  if (
    kept?.id !== request.snapshotId ||
    !element ||
    !described ||
    !kept.reader
  ) {
    return changed("gone");
  }
  if (!element.isConnected || element.ownerDocument !== document) {
    return changed("detached");
  }
  const reader = kept.reader();
  const role = reader.roleOf(element);
  const name = reader.nameOf(element, role);
  if (role !== described.role || name !== described.name) {
    return changed("renamed");
  }
  if (!reader.isVisible(element)) {
    return changed("hidden");
  }
  element.scrollIntoView({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  const hit = hitAtCentre(element, rect);
  if (!hit) {
    return changed("covered");
  }

  const typing = request.tool === "browser_type";
  const pageFields = typing
    ? Array.from(document.querySelectorAll(FIELDS), (field) =>
        fieldFacts(field, ""),
      ).slice(0, 300)
    : [];
  const target = {
    role,
    name,
    field: fieldFacts(element, name),
    textEntry: isTextEntry(element),
    destination: destinationOf(element),
    pageFields,
  };
  const box = [rect.left, rect.top, rect.width, rect.height].map(Math.round);
  const fingerprint = JSON.stringify({ ...target, box });
  if (request.expected === undefined) {
    return { kind: "target", target: { ...target, fingerprint } };
  }
  if (fingerprint !== request.expected) {
    return changed("moved");
  }
  const input: Partial<PageInput> | undefined = Object.getOwnPropertyDescriptor(
    globalThis,
    request.inputKey,
  )?.value;
  if (!input?.click || !input.type) {
    return changed("gone");
  }
  if (!typing) {
    input.click(element, hit, rect);
  } else if (target.textEntry && request.text) {
    input.type(element, request.text);
  } else {
    return changed("not_text");
  }
  return { kind: "acted" };
}
