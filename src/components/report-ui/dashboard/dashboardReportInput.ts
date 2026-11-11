import type { CampaignGoalTable } from "@/lib/campaignGoals";
import type { ReportPeriodInput } from "../data/buildReportPeriod";

/** A record as the dashboards hold it: its table under `_tableId`. */
export type DashboardReportRecord = {
  _tableId?: string;
  /** The table's integration type, as the dashboard tags its records. */
  _source?: string;
  data?: Record<string, unknown> | null;
};

/** A dashboard table with the fields that pick which records it loads. */
export type DashboardReportTable = CampaignGoalTable & { id: string };

// SEO (ahrefs) / Search Console tables render from ahrefs_reports and their
// own tabs, not from crm_records; loading their keyword rows stalled the page.
const DASHBOARD_RECORD_TYPES = new Set([
  "facebook_insights",
  "facebook_ecommerce",
  "google_ads",
  "google_analytics",
  "tiktok",
]);

/**
 * The tables whose records a dashboard loads. With both Facebook table kinds,
 * facebook_insights is skipped: its spend, impressions and clicks would count
 * twice.
 */
export function dashboardRecordTables<T extends DashboardReportTable>(
  tables: ReadonlyArray<T>,
): Array<T> {
  const types = new Set(tables.map((table) => table.integration_type));
  const skipFbInsights =
    types.has("facebook_ecommerce") && types.has("facebook_insights");
  return tables.filter((table) => {
    const type = table.integration_type ?? "";
    if (!DASHBOARD_RECORD_TYPES.has(type)) {
      return false;
    }
    return !(skipFbInsights && type === "facebook_insights");
  });
}

/** A period's dashboard records and tables as the report builder reads them. */
export function dashboardReportInput(input: {
  records: ReadonlyArray<DashboardReportRecord>;
  tables: ReadonlyArray<DashboardReportTable>;
  woo: ReportPeriodInput["woo"];
}): ReportPeriodInput {
  return {
    records: input.records.flatMap((record) =>
      record._tableId
        ? [{ table_id: record._tableId, data: record.data ?? null }]
        : [],
    ),
    tables: [...input.tables],
    woo: input.woo,
  };
}
