import {
  aggregateFacebookRecordsAtLevel,
  shouldIncludeInAdsDashboardAggregate,
} from "@/lib/adsEntityLevel";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import { adsRowOutcomes } from "@/lib/adsRowOutcomes";
import {
  reportCampaignGoalOf,
  type CampaignGoalTable,
  type ReportCampaignGoal,
} from "@/lib/campaignGoals";
import { facebookRowsByGoal } from "@/lib/facebookGoalGroups";
import {
  googleCampaignGoalOf,
  type GoogleAdsRowData,
} from "@/lib/googleCampaignGoals";
import { googleReportFallbackGoal } from "@/lib/googleGoalPresence";

/** A record of a dashboard, tagged with its source table by either page. */
export type DashboardAdsRecord = {
  _source?: string;
  _tableId?: string;
  /** The share link sends each record's public table settings too. */
  _integrationSettings?: Record<string, unknown> | null;
  data?: (GoogleAdsRowData & Record<string, unknown>) | null;
};

/** The goal of a dashboard record's campaign; null for non-ads records. */
export type DashboardRecordGoalOf = (
  record: DashboardAdsRecord,
) => ReportCampaignGoal | null;

const META_SOURCES: ReadonlySet<string> = new Set([
  "facebook_insights",
  "facebook_ecommerce",
]);

/**
 * The goal of each ads record's campaign on a dashboard, over the dashboard's
 * campaign-level ads records in the period. A Meta campaign takes the goal its
 * own table's report gives it (reportCampaignGoalOf). A Google Ads campaign
 * takes the goal the dashboard's Google Ads tables give it
 * (summarizeGoogleAdsCampaigns), so the Google goals here match the Google
 * Ads tab and the goal KPIs.
 */
export function dashboardRecordGoalOf(
  records: Array<DashboardAdsRecord>,
  tables: Array<CampaignGoalTable>,
): DashboardRecordGoalOf {
  const campaignRows = records.filter((record) =>
    shouldIncludeInAdsDashboardAggregate(record.data, record._source),
  );
  const metaRows = campaignRows
    .filter((record) => META_SOURCES.has(record._source ?? ""))
    .map((record) => ({ table_id: record._tableId ?? "", data: record.data }));
  const metaGoalOf = reportCampaignGoalOf(metaRows, tables);
  const google = googleCampaignGoalOf(
    campaignRows.filter((record) => record._source === "google_ads"),
    tables,
    googleReportFallbackGoal(tables),
  );
  return (record) => {
    const source = record._source ?? "";
    if (META_SOURCES.has(source)) {
      return (
        metaGoalOf({ table_id: record._tableId ?? "", data: record.data })
          ?.goal ?? null
      );
    }
    return source === "google_ads" ? google.goalOf(record.data) : null;
  };
}

/** A dashboard's Facebook campaign tables: one per goal, and every campaign. */
export type DashboardFacebookCampaigns = Record<
  ReportCampaignGoal,
  Array<FacebookCampaignRow>
> & { all: Array<FacebookCampaignRow> };

/**
 * A dashboard's Facebook campaigns, each in the table of its report's goal
 * and summed by campaign name within it. A campaign whose rows two reports
 * judge differently shows in each goal's table with that report's rows.
 */
export function dashboardFacebookCampaigns(
  records: Array<DashboardAdsRecord>,
  goalOf: DashboardRecordGoalOf,
): DashboardFacebookCampaigns {
  const facebook = records.filter((record) =>
    META_SOURCES.has(record._source ?? ""),
  );
  return {
    ...facebookRowsByGoal(facebook, "campaign", goalOf),
    all: aggregateFacebookRecordsAtLevel(facebook, "campaign"),
  };
}

/**
 * The leads one ads record adds to the dashboard: a lead campaign's leads, as
 * the leads KPI and the report count them; none for sales or traffic.
 */
export function dashboardRecordLeads(
  record: DashboardAdsRecord,
  goalOf: DashboardRecordGoalOf,
): number {
  const goal = goalOf(record);
  return goal ? adsRowOutcomes(record.data ?? {}, goal).leads : 0;
}
