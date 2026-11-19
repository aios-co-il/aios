import type { AccountInsights } from "../helper-results.ts";
import { fbDatePreset } from "./meta-date-preset.ts";
import { FB_GRAPH_VERSION } from "./meta-api-version.ts";
import { readMetaResponse } from "../meta-response.ts";
import { fbLeadsFromActions } from "./meta-action-leads.ts";

/** Account-level live summary (spend/leads/cpl over a window). Null on failure. */
export async function fbAccountInsights(
  token: string,
  acct: string,
  days: number,
): Promise<AccountInsights | null> {
  try {
    const preset = fbDatePreset(days);
    const url = `https://graph.facebook.com/${FB_GRAPH_VERSION}/act_${acct}/insights?level=account&date_preset=${preset}&fields=spend,impressions,clicks,actions,reach&limit=1&access_token=${token}`;
    const r = await fetch(url);
    const res = await readMetaResponse(r);
    const j = res.ok ? res.value : null;
    if (!r.ok || j?.error || !Array.isArray(j?.data)) {
      return null;
    }
    const d = j.data[0];
    if (!d) {
      return {
        spend: 0,
        leads_count: 0,
        impressions: 0,
        clicks: 0,
        cost_per_lead: null,
        no_delivery: true,
      };
    }
    const leads = fbLeadsFromActions(d.actions);
    const spend = Number(d.spend || 0);
    return {
      spend,
      leads_count: leads,
      impressions: Number(d.impressions || 0),
      clicks: Number(d.clicks || 0),
      reach: d.reach ? Number(d.reach) : null,
      cost_per_lead: leads > 0 ? Number((spend / leads).toFixed(2)) : null,
    };
  } catch {
    return null;
  }
}
