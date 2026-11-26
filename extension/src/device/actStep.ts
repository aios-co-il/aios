/**
 * Whether the panel may click or type for a claimed step, decided from the claimed
 * arguments, the tab's raw `chrome.tabs` address and what the acting function found on the
 * page (pageAct.ts). The contract decides: `deviceCardRule` refuses the never-list and the
 * act floor and asks for everything else, and `fieldNeverReason` names the fields nothing
 * is typed into. What the page wrote can only tighten an answer.
 */
import { deviceCardRule } from "../../../supabase/functions/_shared/carmen/device/card-rule.ts";
import {
  type FieldFacts,
  type FieldNeverReason,
  fieldNeverReason,
} from "../../../supabase/functions/_shared/carmen/device/field-rule.ts";
import type { EnvironmentOrigins } from "../../../supabase/functions/_shared/carmen/device/never-controllable.ts";
import { isTypableText } from "../../../supabase/functions/_shared/carmen/device/typed-text.ts";
import type { PageTarget } from "./keptSnapshot.ts";
import { refIndex } from "./snapshot.ts";

export type ActTool = "browser_click" | "browser_type";

/** The claimed arguments, checked: the read's snapshot, the element's position, the text. */
export type ActArguments = {
  snapshotId: string;
  ref: string;
  index: number;
  /** For typing only; every character is shown on the card. */
  text: string | null;
};

/** Why the panel refuses a click or a type; logged, and reported as `refused` with the rule `never`. */
export type ActRefusal =
  | "invalid_arguments"
  | "never"
  | "configuration"
  /** Typing into anything but a text field. */
  | "not_a_text_field"
  /** A field the contract never types into, or a file picker for a click. */
  | FieldNeverReason
  /** Typing on a page with a password or payment field anywhere on it. */
  | "sensitive_page";

/** The claimed arguments of a click or a type when they are exactly the tool's, else null. */
export function actArguments(
  tool: ActTool,
  args: unknown,
): ActArguments | null {
  if (!args || typeof args !== "object") {
    return null;
  }
  const given = new Map(Object.entries(args));
  const snapshotId = given.get("snapshot_id");
  const ref = given.get("ref");
  const text = given.get("text");
  const index = typeof ref === "string" ? refIndex(ref) : null;
  const fields = tool === "browser_type" ? 3 : 2;
  if (
    typeof snapshotId !== "string" ||
    typeof ref !== "string" ||
    index === null ||
    given.size !== fields ||
    (tool === "browser_type" && !isTypableText(text))
  ) {
    return null;
  }
  return {
    snapshotId,
    ref,
    index,
    text: typeof text === "string" ? text : null,
  };
}

/**
 * Whether the page has a field the contract never types into because it holds a password
 * or a card: then the page counts as sensitive for the card rule, and nothing on it is typed.
 */
export function isSensitivePage(
  pageFields: ReadonlyArray<FieldFacts>,
): boolean {
  return pageFields.some((field) => {
    const reason = fieldNeverReason(field);
    return reason === "password" || reason === "card";
  });
}

/** Why this element may not be acted on, or null. */
export function targetRefusal(
  tool: ActTool,
  target: PageTarget,
): ActRefusal | null {
  const fieldReason = fieldNeverReason(target.field);
  if (tool === "browser_click") {
    // A click on a file picker would hand the page a file the user did not choose for it.
    return fieldReason === "file" ? "file" : null;
  }
  if (fieldReason) {
    return fieldReason;
  }
  if (!target.textEntry) {
    return "not_a_text_field";
  }
  return isSensitivePage(target.pageFields) ? "sensitive_page" : null;
}

/**
 * The contract's rule for this step on this address. Trusted mode does not exist yet and
 * the run may hold another site's text, so the answer is `ask` unless the page is out of
 * reach. A TypeError is the contract refusing a misconfigured environment.
 */
export function actRule(
  tool: ActTool,
  url: string,
  sensitivePage: boolean,
  origins: EnvironmentOrigins,
): "ask" | "never" | "configuration" {
  try {
    const rule = deviceCardRule({
      tool,
      url,
      trusted: false,
      tainted: true,
      origins,
      addedActNeverHosts: [],
      sensitivePage,
      sensitiveScreenshotsAllowed: false,
    });
    // Every click and type asks; any other answer is not one the panel acts on.
    return rule === "ask" ? "ask" : "never";
  } catch (error) {
    if (error instanceof TypeError) {
      console.error("[carmen-panel] the device contract refused", error);
      return "configuration";
    }
    throw error;
  }
}
