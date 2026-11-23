import type { AgentDatabaseClient } from "../database-contracts.ts";

/** Preserves the existing fbGetToken behavior at its extracted boundary. */
export async function fbGetToken(
  supabase: AgentDatabaseClient,
  tenantId: string,
): Promise<string | null> {
  let { data } = await supabase
    .from("tenant_integrations")
    .select("api_key, shared_from_integration_id")
    .in("integration_type", ["facebook", "facebook_lead_ads"])
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (data && !data.api_key && data.shared_from_integration_id) {
    const { data: src } = await supabase
      .from("tenant_integrations")
      .select("api_key")
      .eq("id", data.shared_from_integration_id)
      .maybeSingle();
    if (src?.api_key) {
      data = { ...data, api_key: src.api_key };
    }
  }
  return data?.api_key || null;
}
