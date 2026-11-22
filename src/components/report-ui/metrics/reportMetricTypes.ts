import type { LucideIcon } from "lucide-react";
import type { ReportCampaignGoal } from "@/lib/campaignGoals";
import type { KpiDelta } from "../ReportKpiCard";
import type { ReportFigures } from "./reportFigures";

/** Every metric a report can show; the catalog in reportMetrics.ts defines each. */
export const REPORT_METRIC_KEYS = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "leads",
  "cpl",
  "purchases",
  "costPerPurchase",
  "revenue",
  "roas",
  "addToCart",
  "sessions",
  "wooRevenue",
  "wooOrders",
  "gaRevenue",
  "adsRevenue",
] as const;

export type ReportMetricKey = (typeof REPORT_METRIC_KEYS)[number];

/** A part of a report: every campaign ("all") or one goal's campaigns. */
export type ReportScope = "all" | ReportCampaignGoal;

/**
 * How a value is written: whole currency, currency with agorot (unit costs
 * under 10, such as a click), a count, a ratio such as ROAS, or a percent.
 */
export type ReportMetricFormat =
  "currency" | "unitCost" | "number" | "ratio" | "percent";

/** One metric of the catalog. */
export type ReportMetric = {
  key: ReportMetricKey;
  label: string;
  icon: LucideIcon;
  format: ReportMetricFormat;
  goodWhen: KpiDelta["goodWhen"];
  /** The scopes whose blocks offer this metric. */
  scopes: ReadonlyArray<ReportScope>;
  /** The value, or null when the figures cannot measure it. */
  compute: (figures: ReportFigures) => number | null;
  /**
   * Whether the scope has the source at all (Analytics, a store, a platform
   * that reports add-to-cart). A block leaves out a metric without one,
   * instead of showing a dash that only says "not connected".
   */
  available?: (figures: ReportFigures) => boolean;
  /** Why compute gave null, shown under the dash. */
  whyEmpty?: (figures: ReportFigures) => string;
  /** Where the value comes from, when the source can vary. */
  source?: (figures: ReportFigures) => string | null;
  /**
   * Whose currency the value depends on; without it the value is a count or
   * the site's (store, Analytics) amount.
   */
  money?: (figures: ReportFigures) => ReportMoneyKind;
};

/**
 * "ads": an ads platform amount, in that platform's currency, so a dashboard
 * whose platforms use different currencies shows it per currency.
 * "spendVsSite": spend set against the site's sales, which has no single
 * currency when the platforms' differ. "site": the store's or Analytics'.
 */
export type ReportMoneyKind = "ads" | "spendVsSite" | "site";
