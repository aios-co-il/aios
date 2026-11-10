import type { CampaignGoalRecord } from "@/lib/campaignGoals";
import { dashboardStore } from "@/lib/dashboardCombinedFigures";
import type {
  ReportAnalyticsFigures,
  ReportFigures,
} from "../metrics/reportFigures";
import type { ReportScope } from "../metrics/reportMetricTypes";
import {
  analyticsByDay,
  analyticsDailyRecords,
  sumAnalytics,
} from "./analyticsFigures";
import type { ReportPeriodInput } from "./buildReportPeriod";
import type { ScopeAccumulator } from "./scopeAccumulator";

/** A period's site: its store, Analytics by day and the spend set against sales. */
export type SiteContext = {
  store: ReportFigures["store"];
  analyticsDays: Map<string, ReportAnalyticsFigures>;
  /** One day's spend outside lead campaigns. */
  storeSpendOn: (date: string) => number;
};

/**
 * The period's site figures. The store (dashboardStore) is set against every
 * campaign's spend but the lead campaigns', as combinedDashboardSales does.
 */
export function siteContext(
  input: ReportPeriodInput,
  all: ScopeAccumulator,
  leads: ScopeAccumulator | undefined,
): SiteContext {
  const spend = all.figures.spend - (leads?.figures.spend ?? 0);
  const analyticsRecords = analyticsDailyRecords(input).map(
    (record: CampaignGoalRecord) => ({
      _source: "google_analytics",
      data: record.data,
    }),
  );
  const store = dashboardStore(
    analyticsRecords,
    input.woo ?? { revenue: 0, orders: 0 },
  );
  return {
    store: store ? { ...store, spend } : null,
    analyticsDays: analyticsByDay(input),
    storeSpendOn: (date) =>
      (all.days.get(date)?.spend ?? 0) - (leads?.days.get(date)?.spend ?? 0),
  };
}

/**
 * Sets the site figures on a scope and its days: Analytics on every scope but
 * leads, and the store on every campaign and sales.
 */
export function attachSite(
  acc: ScopeAccumulator,
  scope: ReportScope,
  site: SiteContext,
) {
  const measuresSite = scope !== "leads";
  const sells = scope === "all" || scope === "ecommerce";
  acc.figures = {
    ...acc.figures,
    store: sells ? site.store : null,
    analytics: measuresSite ? sumAnalytics(site.analyticsDays) : null,
  };
  for (const [date, figures] of acc.days) {
    const day = measuresSite ? (site.analyticsDays.get(date) ?? null) : null;
    acc.days.set(date, {
      ...figures,
      analytics: day,
      store: sells ? dayStore(site, date, day) : null,
    });
  }
}

/**
 * A day's store. Analytics reports its sales per day; WooCommerce arrives as
 * the range's total, so its days chart what the platforms report.
 */
function dayStore(
  site: SiteContext,
  date: string,
  day: ReportAnalyticsFigures | null,
): ReportFigures["store"] {
  if (site.store?.source !== "Analytics" || !day) {
    return null;
  }
  return {
    source: "Analytics",
    revenue: day.revenue,
    purchases: day.purchases,
    addToCart: day.addToCart,
    spend: site.storeSpendOn(date),
  };
}
