import type { DuplicateFacebookAdVariantsArgs } from "./meta-campaign-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { resolveClientTenantId } from "./client-tenant.ts";
import { fbGetToken } from "./meta-token.ts";
import { FB_GRAPH_VERSION } from "./meta-api-version.ts";
import { summarizeSourceAd } from "../../_shared/fb-ad-duplicate.ts";

/** Reads the source creative before reusing or queueing an approval. */
export async function loadDuplicateAdSource(
  args: DuplicateFacebookAdVariantsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;
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
    return { failure: { error: "fb_not_connected" } };
  }
  const adRes = await fetch(
    `https://graph.facebook.com/${FB_GRAPH_VERSION}/${args.source_ad_id}?fields=id,name,adset_id,campaign_id,account_id,status,effective_status,creative{id,name,object_story_spec,asset_feed_spec}&access_token=${token}`,
  );
  const ad = await adRes.json();
  if (!adRes.ok || ad?.error) {
    return {
      failure: {
        error: "source_ad_unavailable",
        details: ad?.error || ad,
        source_ad_id: args.source_ad_id,
      },
    };
  }
  if (!ad?.adset_id) {
    return {
      failure: {
        error: "source_ad_missing_adset",
        source_ad_id: args.source_ad_id,
      },
    };
  }
  if (!ad?.creative?.id) {
    return {
      failure: {
        error: "source_creative_unavailable",
        source_ad_id: args.source_ad_id,
      },
    };
  }
  if (!ad.creative.object_story_spec && !ad.creative.asset_feed_spec) {
    return {
      failure: {
        error: "source_creative_unsupported",
        source_ad_id: args.source_ad_id,
        creative_id: ad.creative.id,
      },
    };
  }
  return { source: summarizeSourceAd(ad, ad.creative) };
}
