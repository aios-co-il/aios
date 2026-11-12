import {
  isAdsTableType,
  withDashboardCampaignRows,
} from "../_shared/ads-sync/dashboard-rows.ts";

/** The day window a read asks for; no start means all time. */
export type RecordsDateRange = {
  startDate: string | null;
  endDate?: string | null;
};

/**
 * The PostgREST `or` value of a report read, or null for every row: rows dated
 * in the window or undated, and with `level=campaign` on an ads table only the
 * rows the dashboards sum (dashboard-rows.ts). Date filtering runs in Postgres
 * so report views don't scan a table's full history.
 */
export function recordsFilter(
  range: RecordsDateRange,
  options: { level: string | null; integrationType: string | null },
): string | null {
  const dateFilter = jsonDateFilter(range);
  const campaignRowsOnly =
    options.level === "campaign" && isAdsTableType(options.integrationType);
  return campaignRowsOnly ? withDashboardCampaignRows(dateFilter) : dateFilter;
}

/** Rows whose `data.date` is in the window, or that have none. */
export function jsonDateFilter(range: RecordsDateRange): string | null {
  if (!range.startDate) {
    return null;
  }
  if (range.endDate) {
    return `and(data->>date.gte.${range.startDate},data->>date.lte.${range.endDate}),data->>date.is.null`;
  }
  return `data->>date.gte.${range.startDate},data->>date.is.null`;
}
