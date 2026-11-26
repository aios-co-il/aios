/**
 * Whether a completed step's result may reach the model (AIO-686). The panel reported it,
 * so it is read again from the row, never from the request, checked against the tool's
 * result type as carmen-device-action checked it, and the address it reports is checked
 * against the never-list: plan rule 5's second server check. The address is joined as
 * origin then path by concatenation, never with `new URL(path, origin)`, which would let a
 * path name another host.
 */
import {
  type AnyToolResult,
  pageLocation,
  toolResult,
} from "../../_shared/carmen/device-result-check.ts";
import { isActNeverHost } from "../../_shared/carmen/device/act-never-hosts.ts";
import {
  type EnvironmentOrigins,
  isNeverControllable,
} from "../../_shared/carmen/device/never-controllable.ts";
import type { StepRow } from "./rows.ts";

/**
 * The checked result of a done step, logged when withheld. A contract that cannot read this
 * environment's origins throws; that is logged and the step is refused, never handed over
 * unchecked.
 */
export function storedResult(
  step: Pick<
    StepRow,
    "id" | "tool" | "result" | "observed_origin" | "observed_path"
  >,
  userId: string,
  origins: EnvironmentOrigins,
  sensitiveScreenshotsAllowed: boolean,
): StoredResult {
  try {
    const checked = checkStoredResult(
      step,
      userId,
      origins,
      sensitiveScreenshotsAllowed,
    );
    if (checked.refusal) {
      console.warn(
        `[device] action=${step.id} result withheld: ${checked.refusal}`,
      );
    }
    return checked;
  } catch (error) {
    console.error(
      `[device] action=${step.id} the never-list cannot be read`,
      error,
    );
    return { result: null, refusal: "configuration" };
  }
}

/** A stored result the model may see, or why it may not. */
export type StoredResult =
  { result: AnyToolResult; refusal: null } | { result: null; refusal: string };

/**
 * The stored result of a `done` step when the model may see it. `sensitiveScreenshotsAllowed`
 * is the user's permission as the server reads it now, for a picture of the act floor.
 * Throws `TypeError` when the environment's origins cannot be read; the caller refuses the
 * step.
 */
export function checkStoredResult(
  step: Pick<StepRow, "tool" | "result" | "observed_origin" | "observed_path">,
  userId: string,
  origins: EnvironmentOrigins,
  sensitiveScreenshotsAllowed: boolean,
): StoredResult {
  const result = toolResult(step.tool, step.result, userId);
  const observed = pageLocation({
    origin: step.observed_origin,
    path: step.observed_path,
  });
  if (!result || !observed) {
    return { result: null, refusal: "malformed_result" };
  }
  // Where Chrome said the tab was and where the result says it read must be one page.
  if (result.origin !== observed.origin || result.path !== observed.path) {
    return { result: null, refusal: "addresses_differ" };
  }
  const address = observed.origin + observed.path;
  if (isNeverControllable(address, origins)) {
    return { result: null, refusal: "never_controllable" };
  }
  // A navigation, click or type that lands on the act floor (a redirect to a bank, a link
  // to one) reports nothing of that page: the panel refuses it, and a report that says
  // otherwise is not believed. A read of it is allowed: the floor refuses acting only. A
  // picture of it only for a user who holds the permission now, whatever the panel said.
  if (
    isActNeverHost(address, []) &&
    !floorAllows(step.tool, sensitiveScreenshotsAllowed)
  ) {
    return { result: null, refusal: "act_floor" };
  }
  return { result, refusal: null };
}

/** Whether a done step of this tool may report a page on the act floor. */
function floorAllows(
  tool: string,
  sensitiveScreenshotsAllowed: boolean,
): boolean {
  if (tool === "browser_screenshot") {
    return sensitiveScreenshotsAllowed;
  }
  return tool === "browser_read_page";
}
