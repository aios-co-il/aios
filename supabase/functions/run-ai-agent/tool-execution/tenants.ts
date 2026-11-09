import type { AgentDatabaseClient } from "../database-contracts.ts";

// ─── Tool router (embedding-backed) ───
// Carmen has ~140 tools; sending all of them every request wastes tokens,
// dilutes tool selection, and collides with OpenAI's 128-tool cap. The router
// embeds the user's message and keeps only the most relevant tools plus an
// always-on core set, so each request carries a small, focused toolset. Fully
// best-effort: any failure falls back to the full set (capToolsForTarget stays
// as the final backstop for OpenAI's limit).
// Reflex tools Carmen must always be able to reach regardless of the message.

/** Meta requests one live campaign read may spend: campaigns, ad sets and day insights, paged. */

export async function getAccessibleTenantIds(
  supabase: AgentDatabaseClient,
  tenantId: string,
): Promise<Array<string>> {
  try {
    const { data } = await supabase
      .from("agency_tenant_access")
      .select("source_tenant_id")
      .eq("accessing_tenant_id", tenantId);
    const extra = (data || []).map((r) => r.source_tenant_id).filter(Boolean);
    return Array.from(new Set([tenantId, ...extra]));
  } catch {
    return [tenantId];
  }
}
