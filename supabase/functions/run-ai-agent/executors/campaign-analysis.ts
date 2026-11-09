import type { AgentDatabaseClient } from "../database-contracts.ts";
import { resolveClientTenantId } from "./client-tenant.ts";
import { fbGetToken } from "./meta-token.ts";
import { FB_GRAPH_VERSION } from "./meta-api-version.ts";
import { readMetaResponse } from "../meta-response.ts";
import { fetchCampaignInsights } from "./campaign-insights.ts";
import { fetchCampaignAds } from "./campaign-ads.ts";
import { cplFrom } from "./campaign-cpl.ts";

/** Deep single-campaign analysis + ad-level CPL (inline Graph; no edge-fn dependency). */
export async function fbAnalyzeCampaignInline(
  supabase: AgentDatabaseClient,
  tenantId: string,
  clientId: string,
  campaignId: string,
) {
  const tokenTenant = await resolveClientTenantId(supabase, clientId, tenantId);
  let token = await fbGetToken(supabase, tokenTenant);
  if (!token && tokenTenant !== tenantId) {
    token = await fbGetToken(supabase, tenantId);
  }
  if (!token) {
    return { error: "fb_not_connected" };
  }

  const fields =
    "spend,impressions,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type";

  const metaRes = await fetch(
    `https://graph.facebook.com/${FB_GRAPH_VERSION}/${campaignId}?fields=id,name,status,effective_status,daily_budget,lifetime_budget,objective,issues_info&access_token=${token}`,
  );
  const metaResult = await readMetaResponse(metaRes);
  if (!metaResult.ok) {
    return { error: "fb_api_error", fb_error: metaResult.error };
  }
  const meta = metaResult.value;
  if (meta?.error) {
    return { error: "fb_api_error", fb_error: meta.error };
  }

  const [today, last7, last30, ads] = await Promise.all([
    fetchCampaignInsights(token, campaignId, fields, "today"),
    fetchCampaignInsights(token, campaignId, fields, "last_7d"),
    fetchCampaignInsights(token, campaignId, fields, "last_30d"),
    fetchCampaignAds(token, campaignId),
  ]);
  const cplToday = cplFrom(today);
  const cpl7 = cplFrom(last7);
  const cpl30 = cplFrom(last30);
  const anomalies: Array<string> = [];
  if (
    meta.effective_status &&
    !["ACTIVE", "CAMPAIGN_PAUSED", "PAUSED"].includes(meta.effective_status)
  ) {
    anomalies.push(`קמפיין במצב חריג: ${meta.effective_status}`);
  }
  if (cplToday && cpl7 && cplToday > cpl7 * 1.5) {
    anomalies.push(
      `CPL היום (${cplToday.toFixed(1)}) חורג ב-${((cplToday / cpl7 - 1) * 100).toFixed(0)}% מהממוצע השבועי`,
    );
  }
  const lowCplAds = ads.filter((a) => a.cpl_7d != null && a.leads_7d > 0);
  const recommendations: Array<{
    action: string;
    reason: string;
    severity: string;
    candidate_ad_ids: Array<{
      ad_id: string | null | undefined;
      ad_name: string | null | undefined;
      cpl_7d: number | null;
      leads_7d: number;
    }>;
  }> = [];
  if (
    lowCplAds.length &&
    ads.some((a) => a.effective_status === "PAUSED" && a.cpl_7d != null)
  ) {
    recommendations.push({
      action: "enable_low_cpl_ads",
      reason: "יש מודעות עם CPL נמוך שמושבתות — אפשר להדליק רק אותן אחרי אישור",
      severity: "medium",
      candidate_ad_ids: ads
        .filter(
          (a) =>
            a.effective_status === "PAUSED" &&
            a.cpl_7d != null &&
            a.leads_7d > 0,
        )
        .sort((a, b) => (a.cpl_7d ?? 0) - (b.cpl_7d ?? 0))
        .slice(0, 10)
        .map((a) => ({
          ad_id: a.ad_id,
          ad_name: a.ad_name,
          cpl_7d: a.cpl_7d,
          leads_7d: a.leads_7d,
        })),
    });
  }
  return {
    success: true,
    source: "live_meta_inline",
    campaign: {
      id: meta.id,
      name: meta.name,
      status: meta.status,
      effective_status: meta.effective_status,
      objective: meta.objective,
      daily_budget: meta.daily_budget,
      lifetime_budget: meta.lifetime_budget,
    },
    metrics: {
      today: { ...today, cpl: cplToday },
      last_7d: { ...last7, cpl: cpl7 },
      last_30d: { ...last30, cpl: cpl30 },
    },
    ads,
    anomalies,
    recommendations,
    instruction_for_carmen:
      "הציגי CPL/spend/leads ברמת קמפיין ומודעות. כדי להדליק רק מודעות עם CPL נמוך — השתמשי ב-toggle_facebook_campaign עם campaign_id=ad_id (או fb_resume עם entity_id של המודעה) אחרי אישור מפורש.",
  };
}
