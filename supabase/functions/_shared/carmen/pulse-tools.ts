/** Carmen's tool for the stored campaign pulse. */
export const LATEST_PULSE_TOOL_NAME = "get_latest_campaign_pulse";

/** Carmen's tool that recomputes the campaign pulse now (AIO-237). */
export const REFRESH_PULSE_TOOL_NAME = "refresh_campaign_pulse";

/**
 * The pulse tools run-ai-agent keeps in Carmen's pool past a narrow
 * allowed_tools, so the agent Tools tab shows them as always on; only
 * disabled_tools (Carmen Access) turns them off.
 */
export const CARMEN_PULSE_TOOL_NAMES: readonly string[] = [
  LATEST_PULSE_TOOL_NAME,
  REFRESH_PULSE_TOOL_NAME,
];
