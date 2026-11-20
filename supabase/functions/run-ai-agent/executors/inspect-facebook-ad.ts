import type { InspectFacebookAdArgs } from "./meta-campaign-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { resolveClientTenantId } from "./client-tenant.ts";
import { fbGetToken } from "./meta-token.ts";
import { FB_GRAPH_VERSION } from "./meta-api-version.ts";
import { summarizeSourceAd } from "../../_shared/fb-ad-duplicate.ts";

/** Preserves the existing inspect_facebook_ad executor and side-effect order. */
export async function executeInspectFacebookAd(
  args: InspectFacebookAdArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, callerScope } = context;

  await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
  if (!args.ad_id) {
    return { error: "ad_id_required" };
  }
  const tokenTenant = await resolveClientTenantId(
    supabase,
    args.client_id,
    tenantId,
  );
  let token = await fbGetToken(supabase, tokenTenant);
  if (!token && tokenTenant !== tenantId) {
    token = await fbGetToken(supabase, tenantId);
  }
  if (!token) {
    return { error: "fb_not_connected" };
  }
  const adRes = await fetch(
    `https://graph.facebook.com/${FB_GRAPH_VERSION}/${args.ad_id}?fields=id,name,adset_id,campaign_id,account_id,status,effective_status,creative{id,name,object_story_spec,asset_feed_spec,effective_object_story_id,thumbnail_url}&access_token=${token}`,
  );
  const ad = await adRes.json();
  if (!adRes.ok || ad?.error) {
    return {
      error: "source_ad_unavailable",
      details: ad?.error || ad,
      ad_id: args.ad_id,
    };
  }
  if (!ad?.creative?.id) {
    return { error: "source_creative_unavailable", ad_id: args.ad_id };
  }
  if (!ad.creative.object_story_spec && !ad.creative.asset_feed_spec) {
    return {
      error: "source_creative_unsupported",
      ad_id: args.ad_id,
      creative_id: ad.creative.id,
    };
  }
  const summary = summarizeSourceAd(ad, ad.creative);
  // Enrich with campaign/adset names + budgets when available
  let campaign = null;
  let adset = null;
  if (ad.campaign_id) {
    const cr = await fetch(
      `https://graph.facebook.com/${FB_GRAPH_VERSION}/${ad.campaign_id}?fields=id,name,status,effective_status,daily_budget,lifetime_budget&access_token=${token}`,
    );
    campaign = await cr.json().catch(() => null);
    if (campaign?.error) {
      campaign = null;
    }
  }
  if (ad.adset_id) {
    const ar = await fetch(
      `https://graph.facebook.com/${FB_GRAPH_VERSION}/${ad.adset_id}?fields=id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id&access_token=${token}`,
    );
    adset = await ar.json().catch(() => null);
    if (adset?.error) {
      adset = null;
    }
  }
  return {
    ...summary,
    campaign: campaign
      ? {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          daily_budget_agorot:
            campaign.daily_budget != null
              ? Number(campaign.daily_budget)
              : null,
          daily_budget_ils:
            campaign.daily_budget != null
              ? Number(campaign.daily_budget) / 100
              : null,
        }
      : null,
    adset: adset
      ? {
          id: adset.id,
          name: adset.name,
          status: adset.status,
          daily_budget_agorot:
            adset.daily_budget != null ? Number(adset.daily_budget) : null,
          daily_budget_ils:
            adset.daily_budget != null
              ? Number(adset.daily_budget) / 100
              : null,
        }
      : null,
    instruction_for_carmen:
      "לשכפול עם וריאציות קופי: fb_duplicate_ad_variants(client_id, source_ad_id, variants[{primary_text,headline}], count?, daily_budget?). מחזיר pending_approval — אל תבצעי בלי אישור.",
  };
}
