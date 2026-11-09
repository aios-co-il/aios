import type { ToolExecutionContext } from "../tool-context.ts";

import { executeLeadTool } from "../executors/lead-tools.ts";

/** Preserves legacy routing for create_lead, list_leads, update_lead_status, add_lead_update, update_lead, delete_lead. */
export function legacyDeleteLeadRoute(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): unknown {
  const { supabase, tenantId, userId, accessibleTenantIds, name } = context;

  return executeLeadTool(
    { name, args } as Parameters<typeof executeLeadTool>[0],
    { supabase, tenantId, userId, accessibleTenantIds },
  );
}
