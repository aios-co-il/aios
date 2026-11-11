import {
  getAddToCartFromData,
  getPurchasesFromData,
  getRevenueFromData,
  getSessionsFromData,
} from "@/lib/adsMetrics";
import type {
  CampaignGoalRecord,
  CampaignGoalTable,
} from "@/lib/campaignGoals";
import {
  addAnalytics,
  type ReportAnalyticsFigures,
} from "../metrics/reportFigures";

/** A period's records and the tables they belong to. */
type AnalyticsInput = {
  records: Array<CampaignGoalRecord>;
  tables: Array<CampaignGoalTable>;
};

/** Analytics' daily rows added up per date. */
export function analyticsByDay(
  input: AnalyticsInput,
): Map<string, ReportAnalyticsFigures> {
  const days = new Map<string, ReportAnalyticsFigures>();
  for (const record of analyticsDailyRecords(input)) {
    const data = record.data ?? {};
    const date = String(data.date ?? "");
    const day: ReportAnalyticsFigures = {
      sessions: getSessionsFromData(data),
      revenue: getRevenueFromData(data),
      purchases: getPurchasesFromData(data),
      addToCart: getAddToCartFromData(data),
    };
    days.set(date, addAnalytics(days.get(date) ?? null, day) ?? day);
  }
  return days;
}

/** The records of the dashboard's Analytics tables with report_type daily. */
export function analyticsDailyRecords(input: AnalyticsInput) {
  const analyticsTables = new Set(
    input.tables
      .filter((table) => table.integration_type === "google_analytics")
      .map((table) => table.id),
  );
  return input.records.filter(
    (record) =>
      analyticsTables.has(record.table_id) &&
      record.data?.report_type === "daily",
  );
}

/** Every day's Analytics added up; null without Analytics rows. */
export function sumAnalytics(
  days: Map<string, ReportAnalyticsFigures>,
): ReportAnalyticsFigures | null {
  return [...days.values()].reduce<ReportAnalyticsFigures | null>(
    addAnalytics,
    null,
  );
}
