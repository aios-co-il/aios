import type { AgentDatabaseClient } from "../database-contracts.ts";
import { fbResolveClientAdAccount } from "./meta-client-account.ts";
import { fbGetToken } from "./meta-token.ts";
import { FB_GRAPH_VERSION } from "./meta-api-version.ts";
import { readMetaResponse } from "../meta-response.ts";

/** Live campaign list (id/name/status/objective). Returns null on any failure. */
export async function fbLiveCampaignList(
  supabase: AgentDatabaseClient,
  tenantId: string,
  clientId: string,
) {
  try {
    const acct = await fbResolveClientAdAccount(supabase, tenantId, clientId);
    const token = await fbGetToken(supabase, tenantId);
    if (!acct || !token) {
      return null;
    }
    const url = `https://graph.facebook.com/${FB_GRAPH_VERSION}/act_${acct}/campaigns?fields=id,name,effective_status,objective&limit=300&access_token=${token}`;
    const r = await fetch(url);
    const res = await readMetaResponse(r);
    const j = res.ok ? res.value : null;
    if (!r.ok || j?.error || !Array.isArray(j?.data)) {
      return null;
    }
    return j.data.map((c) => ({
      campaign_id: c.id,
      campaign_name: c.name,
      status: c.effective_status,
      effective_status: c.effective_status,
      objective: c.objective,
    }));
  } catch {
    return null;
  }
}
