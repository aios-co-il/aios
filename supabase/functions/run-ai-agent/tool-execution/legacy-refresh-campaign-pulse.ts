import type { PulsePayload } from "../pulse-refresh/result.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { ToolExecutor } from "./route.ts";
import { executeRefreshCampaignPulseTool } from "../executors/refresh-campaign-pulse.ts";

/** Preserves legacy routing for REFRESH_PULSE_TOOL_NAME. */
export function legacyRefreshCampaignPulseRoute(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
  executeTool: ToolExecutor,
): unknown {
  const {
    supabase,
    tenantId,
    userId,
    callerCampaignerId,
    agentId,
    callerRole,
    callerManagedAgencyIds,
    callerPhone,
    waNotify,
    surface,
    conversationId,
  } = context;

  return executeRefreshCampaignPulseTool(
    args as Parameters<typeof executeRefreshCampaignPulseTool>[0],
    context,
    (pulseArgs) =>
      executeTool(
        "get_latest_campaign_pulse",
        pulseArgs,
        supabase,
        tenantId,
        userId,
        callerCampaignerId,
        agentId,
        callerRole,
        callerManagedAgencyIds,
        callerPhone,
        waNotify,
        surface,
        conversationId,
      ) as Promise<PulsePayload | null>,
  );
}
