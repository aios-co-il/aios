/**
 * The events of a click and of typing, as the panel injects them (AIO-656): installed in the
 * tab's isolated world, in the top frame, just before the acting function (pageAct.ts)
 * runs, which calls them only once the element passed every check. Chrome sends this as
 * source text, so everything it uses is declared inside it. The events are synthetic
 * (`isTrusted` is false), as plan decision 1 accepts; typing sets the field through the
 * isolated world's own `value` setter and never reads what the field held.
 */
import type { PageInput } from "./keptSnapshot.ts";

/** Keeps the click and the typing under `inputKey` in the isolated world. Runs in the tab. */
export function installPageInput(inputKey: string): void {
  /** The pointer and mouse events of a tap at the centre, on the topmost element there. */
  function click(element: Element, hit: Element, rect: DOMRect): void {
    const at = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    hit.dispatchEvent(new PointerEvent("pointerover", at));
    hit.dispatchEvent(new MouseEvent("mouseover", at));
    hit.dispatchEvent(new PointerEvent("pointerdown", { ...at, buttons: 1 }));
    hit.dispatchEvent(new MouseEvent("mousedown", { ...at, buttons: 1 }));
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: true });
    }
    hit.dispatchEvent(new PointerEvent("pointerup", at));
    hit.dispatchEvent(new MouseEvent("mouseup", at));
    hit.dispatchEvent(new MouseEvent("click", { ...at, detail: 1 }));
  }

  /** Replaces the field's content with the text through the browser's own setter, then tells the page. */
  function type(element: Element, text: string): void {
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: true });
    }
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : null;
    // The isolated world's own setter: a page that wraps `value` cannot see or change it.
    const setter = prototype
      ? Object.getOwnPropertyDescriptor(prototype, "value")?.set
      : undefined;
    if (setter) {
      setter.call(element, text);
    } else {
      element.textContent = text;
    }
    const typed = { bubbles: true, composed: true, data: text };
    element.dispatchEvent(
      new InputEvent("input", { ...typed, inputType: "insertText" }),
    );
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const input: PageInput = { click, type };
  Reflect.set(globalThis, inputKey, input);
}
