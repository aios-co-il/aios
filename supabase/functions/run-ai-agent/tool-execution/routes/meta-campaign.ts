import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeGetFacebookCampaignData } from "../../executors/get-facebook-campaign-data.ts";
import { executeListFacebookCampaigns } from "../../executors/list-facebook-campaigns.ts";
import { executeFacebookCampaignMutation } from "../../executors/facebook-campaign-mutation.ts";
import { executeAnalyzeFacebookCampaign } from "../../executors/analyze-facebook-campaign.ts";
import { executeListFacebookAds } from "../../executors/list-facebook-ads.ts";
import { executeInspectFacebookAd } from "../../executors/inspect-facebook-ad.ts";
import { executeDuplicateFacebookAdVariants } from "../../executors/duplicate-facebook-ad-variants.ts";

/** meta-campaign tool routes; argument assertions retain the legacy tool boundary. */
export const metaCampaignRoutes: Record<string, ToolRoute> = {
  get_facebook_campaign_data: bindToolRoute(executeGetFacebookCampaignData),
  list_facebook_campaigns: bindToolRoute(executeListFacebookCampaigns),
  toggle_facebook_campaign: bindToolRoute(executeFacebookCampaignMutation),
  update_facebook_budget: bindToolRoute(executeFacebookCampaignMutation),
  duplicate_facebook_campaign: bindToolRoute(executeFacebookCampaignMutation),
  analyze_facebook_campaign: bindToolRoute(executeAnalyzeFacebookCampaign),
  list_facebook_ads: bindToolRoute(executeListFacebookAds),
  inspect_facebook_ad: bindToolRoute(executeInspectFacebookAd),
  fb_duplicate_ad_variants: bindToolRoute(executeDuplicateFacebookAdVariants),
  duplicate_facebook_ad_variants: bindToolRoute(
    executeDuplicateFacebookAdVariants,
  ),
};
