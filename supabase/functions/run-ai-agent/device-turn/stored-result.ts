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
  const address = observed.origin + observed.path;
  if (isNeverControllable(address, origins)) {
    return { result: null, refusal: "never_controllable" };
  }
  // A navigation, click or type that lands on the act floor (a redirect to a bank, a link
  // to one) reports nothing of that page: the panel refuses it, and a report that says
  // otherwise is not believed. A read of it is allowed: the floor refuses acting only.
  if (step.tool !== "browser_read_page" && isActNeverHost(address, [])) {
    return { result: null, refusal: "act_floor" };
  }
  return { result, refusal: null };
}
