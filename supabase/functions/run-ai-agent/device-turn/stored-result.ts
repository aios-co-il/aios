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
import {
  type EnvironmentOrigins,
  isNeverControllable,
} from "../../_shared/carmen/device/never-controllable.ts";
import type { StepRow } from "./rows.ts";

/** A stored result the model may see, or why it may not. */
export type StoredResult =
  { result: AnyToolResult; refusal: null } | { result: null; refusal: string };

/**
 * The stored result of a `done` step when the model may see it. Throws `TypeError` when the
 * environment's origins cannot be read; the caller refuses the step.
 */
export function checkStoredResult(
  step: Pick<StepRow, "tool" | "result" | "observed_origin" | "observed_path">,
  userId: string,
  origins: EnvironmentOrigins,
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
  if (isNeverControllable(observed.origin + observed.path, origins)) {
    return { result: null, refusal: "never_controllable" };
  }
  return { result, refusal: null };
}
