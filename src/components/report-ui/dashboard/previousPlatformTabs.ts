import { summarizeGoogleAdsCampaigns } from "@/components/dynamic-tables/GoogleAdsCampaignSection/summarizeGoogleAdsCampaigns";
import type { GoogleAdsCampaignSummary } from "@/components/dynamic-tables/GoogleAdsCampaignSection/types";
import { shouldIncludeInAdsDashboardAggregate } from "@/lib/adsEntityLevel";
import {
  dashboardFacebookCampaigns,
  dashboardRecordGoalOf,
  type DashboardFacebookCampaigns,
} from "@/lib/dashboardCampaignGoals";
import type {
  DashboardReportRecord,
  DashboardReportTable,
} from "./dashboardReportInput";

/** A platform tab whose campaign tables compare with the previous period. */
export type PlatformTab = "facebook" | "google_ads";

/** The previous period of the dashboard's Facebook or Google tab. */
export type PreviousPlatformTabs = {
  facebook: DashboardFacebookCampaigns | null;
  google: GoogleAdsCampaignSummary | null;
};

/** A previous-period record tagged with its table's platform. */
export type PlatformTaggedRecord = DashboardReportRecord & { _source: string };

export const NO_PREVIOUS_TABS: PreviousPlatformTabs = {
  facebook: null,
  google: null,
};

/**
 * The tab's campaigns in the previous period, built as the tab builds the
 * current ones. The signed-in and the shared dashboard both call it, so their
 * comparison columns read the same.
 */
export function previousPlatformTabsOf(
  records: ReadonlyArray<PlatformTaggedRecord>,
  tables: ReadonlyArray<DashboardReportTable>,
  platform: PlatformTab,
): PreviousPlatformTabs {
  if (platform === "google_ads") {
    return {
      facebook: null,
      google: summarizeGoogleAdsCampaigns(
        records.filter((record) => record._source === "google_ads"),
        [...tables],
      ),
    };
  }
  const campaignRows = records.filter((record) =>
    shouldIncludeInAdsDashboardAggregate(record.data, record._source),
  );
  return {
    facebook: dashboardFacebookCampaigns(
      campaignRows,
      dashboardRecordGoalOf([...records], [...tables]),
    ),
    google: null,
  };
}

/** Whether the tab is one whose tables compare by campaign. */
export function isPlatformTab(tab: string): tab is PlatformTab {
  return tab === "facebook" || tab === "google_ads";
}

/** The dashboard tabs whose figures compare with the previous period. */
export function showsPreviousToggle(tab: string): boolean {
  return tab === "all" || isPlatformTab(tab);
}
