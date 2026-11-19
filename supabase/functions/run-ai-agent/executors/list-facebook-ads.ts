import type { ListFacebookAdsArgs } from "./meta-campaign-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { fbAnalyzeCampaignInline } from "./campaign-analysis.ts";

/** Preserves the existing list_facebook_ads executor and side-effect order. */
export async function executeListFacebookAds(
  args: ListFacebookAdsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, callerScope } = context;

  await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
  if (!args.campaign_id) {
    return { error: "campaign_id_required" };
  }
  const analysis = await fbAnalyzeCampaignInline(
    supabase,
    tenantId,
    args.client_id,
    args.campaign_id,
  );
  if (analysis?.error) {
    return analysis;
  }
  return {
    campaign_id: args.campaign_id,
    campaign_name: analysis.campaign?.name || null,
    count: (analysis.ads || []).length,
    ads: analysis.ads || [],
    instruction_for_carmen:
      "מייני לפי cpl_7d. להדלקת מודעות נבחרות בלבד — toggle_facebook_campaign עם campaign_id=<ad_id>, level=ad, status=ACTIVE אחרי אישור. לשכפול מודעה מנצחת עם קופי חדש — inspect_facebook_ad ואז fb_duplicate_ad_variants (דורש אישור).",
  };
}
