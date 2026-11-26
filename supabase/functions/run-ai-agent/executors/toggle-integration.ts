import type { ToolExecutionContext } from "../tool-context.ts";

type ToggleIntegrationArgs = {
  integration_id: string;
  is_active: boolean;
};

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
