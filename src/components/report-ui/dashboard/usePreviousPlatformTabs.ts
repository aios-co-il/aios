import { useMemo } from "react";
import { summarizeGoogleAdsCampaigns } from "@/components/dynamic-tables/GoogleAdsCampaignSection/summarizeGoogleAdsCampaigns";
import type { GoogleAdsCampaignSummary } from "@/components/dynamic-tables/GoogleAdsCampaignSection/types";
import { shouldIncludeInAdsDashboardAggregate } from "@/lib/adsEntityLevel";
import {
  dashboardFacebookCampaigns,
  dashboardRecordGoalOf,
  type DashboardFacebookCampaigns,
} from "@/lib/dashboardCampaignGoals";
import type { DashboardReportTable } from "./dashboardReportInput";
import { usePreviousDashboardRecords } from "./usePreviousReportPeriod";

type PlatformTab = "facebook" | "google_ads";

/** The previous period of the dashboard's Facebook or Google tab. */
export type PreviousPlatformTabs = {
  facebook: DashboardFacebookCampaigns | null;
  google: GoogleAdsCampaignSummary | null;
};

const NONE: PreviousPlatformTabs = { facebook: null, google: null };

/**
 * The open platform tab's campaigns in the period before the dashboard's
 * range, built as the tab builds the current ones. Null while they load,
 * while the comparison is off, or on another tab.
 */
export function usePreviousPlatformTabs({
  tables,
  dateFilter,
  customFrom,
  customTo,
  tab,
  enabled,
}: {
  tables: ReadonlyArray<DashboardReportTable>;
  dateFilter: string;
  customFrom: string;
  customTo: string;
  tab: string;
  enabled: boolean;
}): PreviousPlatformTabs {
  const platform = isPlatformTab(tab) ? tab : null;
  const records = usePreviousDashboardRecords({
    tables,
    dateFilter,
    customFrom,
    customTo,
    enabled: enabled && platform !== null,
  });
  return useMemo(() => {
    if (!records || !platform) {
      return NONE;
    }
    // The previous rows carry only their table id; tag each with its
    // platform, as the dashboard tags the current ones.
    const typeOf = new Map(
      tables.map((table) => [table.id, table.integration_type ?? ""]),
    );
    const tagged = records.map((record) => ({
      ...record,
      _source: typeOf.get(record._tableId ?? "") ?? "",
    }));
    if (platform === "google_ads") {
      return {
        facebook: null,
        google: summarizeGoogleAdsCampaigns(
          tagged.filter((record) => record._source === "google_ads"),
          [...tables],
        ),
      };
    }
    const campaignRows = tagged.filter((record) =>
      shouldIncludeInAdsDashboardAggregate(record.data, record._source),
    );
    return {
      facebook: dashboardFacebookCampaigns(
        campaignRows,
        dashboardRecordGoalOf(tagged, [...tables]),
      ),
      google: null,
    };
  }, [records, platform, tables]);
}

/** Whether the tab is one whose tables compare by campaign here. */
function isPlatformTab(tab: string): tab is PlatformTab {
  return tab === "facebook" || tab === "google_ads";
}
