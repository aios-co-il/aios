import type { ToggleIntegrationArgs } from "./admin-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing toggle_integration executor and side-effect order. */
export async function executeToggleIntegration(
  args: ToggleIntegrationArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const { data, error } = await supabase
    .from("tenant_integrations")
    .update({ is_active: args.is_active })
    .eq("id", args.integration_id)
    .in("tenant_id", accessibleTenantIds)
    .select("id, integration_type, is_active")
    .single();
  if (error) {
    throw error;
  }
  return data;
}
