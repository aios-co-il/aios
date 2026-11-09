import type { ListIntegrationsArgs } from "./admin-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AgentDatabaseClient } from "../database-contracts.ts";
import { integrationTypesFor } from "../whatsapp-lines.ts";

/** Preserves the existing list_integrations executor and side-effect order. */
export async function executeListIntegrations(
  args: ListIntegrationsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const db: AgentDatabaseClient = supabase;
  let q = db
    .from("tenant_integrations")
    .select(
      "id, integration_type, is_active, settings, last_sync_at, created_at",
    )
    .in("tenant_id", accessibleTenantIds);
  if (args.type) {
    q = q.in("integration_type", integrationTypesFor(args.type));
  }
  if (args.only_active) {
    q = q.eq("is_active", true);
  }
  const { data, error } = await q.order("integration_type");
  if (error) {
    throw error;
  }
  return {
    count: data?.length || 0,
    integrations: (data || []).map((i) => ({
      id: i.id,
      type: i.integration_type,
      is_active: i.is_active,
      last_sync_at: i.last_sync_at,
    })),
  };
}
