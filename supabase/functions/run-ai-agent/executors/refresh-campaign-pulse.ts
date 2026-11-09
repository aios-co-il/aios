import type { REFRESHPULSETOOLNAMEArgs } from "./pulse-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import {
  executeRefreshCampaignPulse,
  type RefreshPulseContext,
} from "../pulse-refresh/tool.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";

/** Preserves the existing refresh_campaign_pulse executor and side-effect order. */
export async function executeRefreshCampaignPulseTool(
  args: REFRESHPULSETOOLNAMEArgs,
  context: ToolExecutionContext,
  loadPulse: Parameters<typeof executeRefreshCampaignPulse>[1],
) {
  const {
    supabase,
    tenantId,
    surface,
    callerCampaignerId,
    actorUserId,
    accessibleTenantIds,
    callerScope,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  } = context;
  return await executeRefreshCampaignPulse(
    {
      args,
      supabase: supabase as unknown as RefreshPulseContext["supabase"],
      tenantId,
      surface,
      callerCampaignerId,
      actorUserId,
      accessibleTenantIds,
      assertCallerCanAccessClient: (clientId: string) =>
        assertCallerCanAccessClient(supabase, clientId, callerScope),
      supabaseUrl: SUPABASE_URL,
      serviceKey: SUPABASE_SERVICE_ROLE_KEY,
    },
    loadPulse,
  );
}
