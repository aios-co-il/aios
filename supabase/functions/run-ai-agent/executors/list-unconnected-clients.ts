import type { ListUnconnectedClientsArgs } from "./ad-report-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AgentDatabaseClient } from "../database-contracts.ts";

/** Preserves the existing list_unconnected_clients executor and side-effect order. */
export async function executeListUnconnectedClients(
  args: ListUnconnectedClientsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  // Get active clients that don't have a facebook_insights table
  const db: AgentDatabaseClient = supabase;
  const { data: allClients, error: clientsErr } = await db
    .from("clients")
    .select("id, name, agency_id, agencies(name)")
    .in("tenant_id", accessibleTenantIds)
    .in("status", ["active", "onboarding"])
    .order("name");
  if (clientsErr) {
    throw clientsErr;
  }

  const { data: connectedTables } = await db
    .from("crm_tables")
    .select("client_id")
    .in("tenant_id", accessibleTenantIds)
    .eq("integration_type", "facebook_insights")
    .not("client_id", "is", null);

  const connectedClientIds = new Set(
    (connectedTables || []).map((t) => t.client_id),
  );
  const unconnected = (allClients || [])
    .filter((c) => !connectedClientIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      agency_name: c.agencies?.name,
    }));

  return { count: unconnected.length, unconnected_clients: unconnected };
}
