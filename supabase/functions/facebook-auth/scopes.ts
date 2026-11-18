/**
 * Permissions requested by the Facebook Login dialog. Each one backs a feature
 * that calls the Graph API with it; App Review must list exactly these.
 */
export const FACEBOOK_LOGIN_SCOPES: ReadonlyArray<string> = [
  // Lead Ads: list pages, read forms and leads.
  "pages_show_list",
  "pages_manage_ads",
  "leads_retrieval",
  "pages_read_engagement",
  // Subscribe pages to the leadgen webhook (POST {page}/subscribed_apps).
  "pages_manage_metadata",
  // Ad reports, campaign launcher and pausing campaigns.
  "ads_management",
  // Agencies' client ad accounts (me/businesses, owned/client ad accounts).
  "business_management",
  // Publishing studio and comment handling.
  "pages_manage_posts",
  "pages_manage_engagement",
  // Instagram (requires a connected IG Business/Creator account).
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
];
