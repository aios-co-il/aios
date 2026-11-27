import type { ToolExecutionContext } from "../tool-context.ts";
import { executeLeadTool } from "../executors/lead-tools.ts";

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
