/**
 * The function the panel injects before a screenshot (AIO-656), in the extension's isolated
 * world, into every frame of the tab the site's grant reaches: the facts of each field the
 * picture could show, so the panel knows whether the page holds a password or payment
 * field. Chrome sends it as source text, so it uses nothing but its arguments and the DOM;
 * it repeats pageAct.ts's field facts for that reason. It never reads a field's value.
 */
import type { FieldFacts } from "../../../supabase/functions/_shared/carmen/device/field-rule.ts";

/** The attributes and label facts of the frame's fields, at most `max`. Runs in the tab. */
export function collectFieldFacts(
  selector: string,
  max: number,
): Array<FieldFacts> {
  return Array.from(document.querySelectorAll(selector))
    .slice(0, max)
    .map((element) => ({
      type: element.getAttribute("type"),
      autocomplete: element.getAttribute("autocomplete"),
      names: [
        element.getAttribute("name"),
        element.getAttribute("id"),
        element.getAttribute("aria-label"),
        element.getAttribute("placeholder"),
      ],
    }));
}
