import { readMetaResponse } from "../meta-response.ts";
import type { MetaAdMetrics } from "../helper-results.ts";
import { FB_GRAPH_VERSION } from "./meta-api-version.ts";
import { fbLeadsFromActions } from "./meta-action-leads.ts";

/** Preserves the existing campaign ads calculation/read. */
export async function fetchCampaignAds(token: string, campaignId: string) {
  const r = await fetch(
    `https://graph.facebook.com/${FB_GRAPH_VERSION}/${campaignId}/ads?fields=id,name,effective_status,status&limit=200&access_token=${token}`,
  );
  const res = await readMetaResponse(r);
  const j = res.ok ? res.value : null;
  if (!r.ok || j?.error || !Array.isArray(j?.data)) {
    return [];
  }
  const ads = j.data;
  // Ad-level insights for last_7d
  const insightsUrl = `https://graph.facebook.com/${FB_GRAPH_VERSION}/${campaignId}/insights?level=ad&date_preset=last_7d&fields=ad_id,ad_name,spend,actions,impressions,clicks&limit=200&access_token=${token}`;
  const ir = await fetch(insightsUrl);
  const ires = await readMetaResponse(ir);
  const ij = ires.ok ? ires.value : null;
  const byAd = new Map<string, MetaAdMetrics>();
  for (const row of ij?.data || []) {
    const leads = fbLeadsFromActions(row.actions || []);
    const spend = Number(row.spend || 0);
    byAd.set(String(row.ad_id), {
      spend,
      leads,
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      cpl: leads > 0 ? Number((spend / leads).toFixed(2)) : null,
    });
  }
  return ads
    .map((ad) => {
      const m = byAd.get(String(ad.id)) || {
        spend: 0,
        leads: 0,
        impressions: 0,
        clicks: 0,
        cpl: null,
      };
      return {
        ad_id: ad.id,
        ad_name: ad.name,
        status: ad.status,
        effective_status: ad.effective_status,
        spend_7d: m.spend,
        leads_7d: m.leads,
        cpl_7d: m.cpl,
        impressions_7d: m.impressions,
        clicks_7d: m.clicks,
      };
    })
    .sort((a, b) => (a.cpl_7d ?? 999999) - (b.cpl_7d ?? 999999));
}
