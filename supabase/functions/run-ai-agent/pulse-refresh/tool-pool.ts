import { missingEnabledTools } from "../missing-enabled-tools.ts";
import { REFRESH_CAMPAIGN_PULSE_TOOL } from "./tool.ts";

/** The tools the pulse rules block sends every pulse request to. */
const CARMEN_PULSE_TOOL_NAMES: readonly string[] = [
  "get_latest_campaign_pulse",
  REFRESH_CAMPAIGN_PULSE_TOOL.name,
];

/**
 * Keeps get_latest_campaign_pulse and refresh_campaign_pulse in Carmen's tool
 * pool, in chat and on the direct_tool path. The pulse rules block sends pulse
 * requests to them, so an allowed_tools list that predates them (or a skin
 * that does not list them) must not hide them. A tool turned off in
 * disabled_tools stays off; other agents get their pool as is.
 */
export function keepCarmenPulseTools<T extends { name: string }>(
  tools: T[],
  allTools: readonly T[],
  {
    isCarmen,
    disabledTools,
  }: { isCarmen: boolean; disabledTools: readonly string[] },
): T[] {
  if (!isCarmen) {
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
