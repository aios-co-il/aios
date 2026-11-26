/**
 * What a successful claim hands the panel (`DeviceClaimReply`): the tool, its arguments and
 * the server's two facts about the step, each read here and never from a request, the page
 * or the model: the trusted origin of a click or a type (trust.ts) and, for a screenshot,
 * the user's permission to picture a sensitive page (AIO-656).
 */
import type { DeviceClaimReply } from "../_shared/carmen/device/contract.ts";
import { sensitiveScreenshotsAllowed } from "../_shared/carmen/sensitive-screenshots.ts";
import type { ActionDb, OwnAction } from "./rows.ts";
import { claimTrust } from "./trust.ts";

/** The claim's answer for an action just claimed with these arguments. */
export async function claimReply(
  serviceDb: ActionDb,
  action: OwnAction & { tool: DeviceClaimReply["tool"] },
  args: unknown,
): Promise<DeviceClaimReply> {
  const trust = await claimTrust(serviceDb, action);
  const sensitive =
    action.tool === "browser_screenshot" &&
    (await sensitiveScreenshotsAllowed(
      serviceDb,
      action.tenant_id,
      action.user_id,
    ));

  return {
    tool: action.tool,
    arguments: args,
    ...trust,
    sensitive_screenshots_allowed: sensitive,
  };
}
