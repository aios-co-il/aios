/**
 * Whether the panel may picture the tab for a claimed `browser_screenshot` (AIO-656),
 * decided from the claimed arguments, the tab's raw `chrome.tabs` address, the fields the
 * page holds and the permission the server read for the user. The contract decides: an
 * ordinary page runs without a card, and a page on the act floor or with a password or
 * payment field is refused unless the user holds the manager's permission, and then the
 * card asks every time. What the page wrote can only tighten an answer.
 */
import { deviceCardRule } from "../../../supabase/functions/_shared/carmen/device/card-rule.ts";
import type { FieldFacts } from "../../../supabase/functions/_shared/carmen/device/field-rule.ts";
import type { EnvironmentOrigins } from "../../../supabase/functions/_shared/carmen/device/never-controllable.ts";
import { isFieldFacts } from "./actAnswer.ts";
import { isSensitivePage } from "./actStep.ts";
import type { ReadOutcome } from "./completion.ts";

/** Whether the claimed arguments are exactly the tool's: none. */
export function shotArguments(args: unknown): boolean {
  return (
    !!args &&
    typeof args === "object" &&
    !Array.isArray(args) &&
    Object.keys(args).length === 0
  );
}

/**
 * Whether the page's frames hold a password or payment field. Anything the frames sent
 * that is not a list of field facts counts as sensitive: a page the panel cannot read is
 * never taken for a harmless one.
 */
export function sensitiveFrames(frames: ReadonlyArray<unknown>): boolean {
  const fields: Array<FieldFacts> = [];
  for (const frame of frames) {
    if (!Array.isArray(frame) || !frame.every(isFieldFacts)) {
      return true;
    }
    fields.push(...frame);
  }
  return isSensitivePage(fields);
}

/**
 * The contract's rule for a picture of this address. `allowed` is the permission the
 * claim carried from the server, never anything the page or the model said. A TypeError
 * is the contract refusing a misconfigured environment.
 */
export function shotRule(
  url: string,
  sensitivePage: boolean,
  allowed: boolean,
  origins: EnvironmentOrigins,
): "free" | "ask" | "never" | "configuration" {
  try {
    return deviceCardRule({
      tool: "browser_screenshot",
      url,
      trusted: false,
      tainted: true,
      origins,
      addedActNeverHosts: [],
      sensitivePage,
      sensitiveScreenshotsAllowed: allowed,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      console.error("[carmen-panel] the device contract refused", error);
      return "configuration";
    }
    throw error;
  }
}

/** A refusal before any picture: logged, reported as `refused` with the rule `never`. */
export function refusedShot(reason: string): ReadOutcome {
  console.warn(`[carmen-panel] refused browser_screenshot: ${reason}`);
  return { status: "refused" };
}
