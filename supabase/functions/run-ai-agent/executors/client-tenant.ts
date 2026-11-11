import type { AgentDatabaseClient } from "../database-contracts.ts";

/** Resolve which tenant owns a client (for FB token / shared integrations). */
export async function resolveClientTenantId(
  supabase: AgentDatabaseClient,
  clientId: string,
  fallbackTenantId: string,
): Promise<string> {
  const { data } = await supabase
    .from("clients")
    .select("tenant_id")
    .eq("id", clientId)
    .maybeSingle();
  return data?.tenant_id || fallbackTenantId;
}
