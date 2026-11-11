import { summarizeGoogleAdsCampaigns } from "@/components/dynamic-tables/GoogleAdsCampaignSection/summarizeGoogleAdsCampaigns";
import type { GoogleAdsCampaignSummary } from "@/components/dynamic-tables/GoogleAdsCampaignSection/types";
import { shouldIncludeInAdsDashboardAggregate } from "@/lib/adsEntityLevel";
import {
  dashboardFacebookCampaigns,
  dashboardRecordGoalOf,
  type DashboardAdsRecord,
  type DashboardFacebookCampaigns,
} from "@/lib/dashboardCampaignGoals";
import type { GoogleReportTable } from "@/lib/googleCampaignGoals";
import type { CampaignGoalTable } from "@/lib/campaignGoals";

/**
 * The previous period's Facebook campaigns by goal, built like the tab's own:
 * campaign-level rows only, each under its report's goal. Null while the
 * comparison is off or still loading.
 */
export function previousFacebookCampaigns(
  records: ReadonlyArray<DashboardAdsRecord> | undefined,
  tables: Array<CampaignGoalTable>,
): DashboardFacebookCampaigns | null {
  if (!records) {
    return null;
  }
  const campaignRows = records.filter((record) =>
    shouldIncludeInAdsDashboardAggregate(record.data, record._source),
  );
  return dashboardFacebookCampaigns(
    campaignRows,
    dashboardRecordGoalOf(campaignRows, tables),
  );
}

/** The previous period's Google Ads summary; null while off or loading. */
export function previousGoogleAdsSummary(
  records: ReadonlyArray<DashboardAdsRecord> | undefined,
  tables: Array<GoogleReportTable>,
): GoogleAdsCampaignSummary | null {
  if (!records) {
    return null;
  }
  return summarizeGoogleAdsCampaigns(
    records.filter((record) => record._source === "google_ads"),
    tables,
  );
}
