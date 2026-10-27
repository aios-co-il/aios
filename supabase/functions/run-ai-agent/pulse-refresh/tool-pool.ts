import { REFRESH_CAMPAIGN_PULSE_TOOL } from "./tool.ts";

/**
 * Keeps refresh_campaign_pulse in Carmen's tool pool. The pulse rules block
 * sends refresh requests to this tool, so an agent's allowed_tools list that
 * predates it (or a skin that does not list it) must not hide it. A tool
 * turned off in disabled_tools stays off; other agents get their pool as is.
 */
export function keepPulseRefreshTool<T extends { name: string }>(
  tools: T[],
  allTools: readonly T[],
  {
    isCarmen,
    disabledTools,
  }: { isCarmen: boolean; disabledTools: readonly string[] },
): T[] {
  const { name } = REFRESH_CAMPAIGN_PULSE_TOOL;
  if (
    !isCarmen ||
    disabledTools.includes(name) ||
    tools.some((t) => t.name === name)
  ) {
    return tools;
  }
  const refreshTool = allTools.find((t) => t.name === name);
  return refreshTool ? [...tools, refreshTool] : tools;
}
