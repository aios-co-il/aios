import { CARMEN_PULSE_TOOL_NAMES } from "../../_shared/carmen/pulse-tools.ts";
import { missingEnabledTools } from "../missing-enabled-tools.ts";
import {
  isUnidentifiedPulseCaller,
  type PulseCallerIdentity,
} from "./input.ts";

/**
 * Keeps get_latest_campaign_pulse and refresh_campaign_pulse in Carmen's tool
 * pool, in chat and on the direct_tool path. The pulse rules block sends pulse
 * requests to them, so an allowed_tools list that predates them (or a skin
 * that does not list them) must not hide them. A tool turned off in
 * disabled_tools stays off; other agents get their pool as is. A WhatsApp or
 * task caller with no campaigner and no user keeps what allowed_tools gave,
 * and skins add no pulse tool for it either (skinToolDenylist).
 */
export function keepCarmenPulseTools<T extends { name: string }>(
  tools: T[],
  allTools: readonly T[],
  {
    isCarmen,
    disabledTools,
    caller = {},
  }: {
    isCarmen: boolean;
    disabledTools: readonly string[];
    caller?: PulseCallerIdentity;
  },
): T[] {
  if (!isCarmen || isUnidentifiedPulseCaller(caller)) {
    return tools;
  }
  const missing = missingEnabledTools(
    tools,
    allTools,
    CARMEN_PULSE_TOOL_NAMES,
    disabledTools,
  );
  return missing.length > 0 ? [...tools, ...missing] : tools;
}

/**
 * The denylist matched and pinned skins apply when they add their tools past
 * allowed_tools. For a WhatsApp or task caller with no campaigner and no user
 * it also holds back both pulse tools, so a skin that fires on "רכישות" or
 * "רענני דופק" cannot hand a client contact the tenant's pulse that a narrow
 * allowed_tools withheld.
 */
export function skinToolDenylist(
  disabledTools: readonly string[],
  caller: PulseCallerIdentity = {},
): readonly string[] {
  return isUnidentifiedPulseCaller(caller)
    ? [...disabledTools, ...CARMEN_PULSE_TOOL_NAMES]
    : disabledTools;
}
