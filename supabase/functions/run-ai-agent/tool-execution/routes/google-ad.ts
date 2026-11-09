import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeListGoogleAdAccounts } from "../../executors/list-google-ad-accounts.ts";
import { executeListGoogleCampaigns } from "../../executors/list-google-campaigns.ts";
import { executeCreateGoogleAdsReportTable } from "../../executors/create-google-ads-report-table.ts";
import { executeSyncFacebookInsights } from "../../executors/sync-facebook-insights.ts";
import { executeConnectGoogleAdsAccount } from "../../executors/connect-google-ads-account.ts";
import { executeConnectClientMetaAdAccount } from "../../executors/connect-client-meta-ad-account.ts";

/** google-ad tool routes; argument assertions retain the legacy tool boundary. */
export const googleAdRoutes: Record<string, ToolRoute> = {
  list_google_ad_accounts: bindToolRoute(executeListGoogleAdAccounts),
  list_google_campaigns: bindToolRoute(executeListGoogleCampaigns),
  create_google_ads_report_table: bindToolRoute(
    executeCreateGoogleAdsReportTable,
  ),
  sync_google_ads_report: bindToolRoute(executeSyncFacebookInsights),
  sync_facebook_insights: bindToolRoute(executeSyncFacebookInsights),
  connect_google_ads_account: bindToolRoute(executeConnectGoogleAdsAccount),
  connect_client_meta_ad_account: bindToolRoute(
    executeConnectClientMetaAdAccount,
  ),
};
