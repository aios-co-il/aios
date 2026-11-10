import type { DashboardStore } from "@/lib/dashboardCombinedFigures";
import type { DashboardGoalMetrics } from "@/lib/dashboardGoalSummary";

/** Analytics' daily rows added up for the range. */
export type ReportAnalyticsFigures = {
  sessions: number;
  revenue: number;
  purchases: number;
  addToCart: number;
};

/**
 * What a report's metrics are computed from, for one scope: the whole
 * dashboard, one goal's campaigns, one channel, one campaign or one day. The
 * ads figures count only what the scope's goal is measured on
 * (summarizeDashboardGoals); the site figures are null where the scope has no
 * site, such as a single campaign.
 */
export type ReportFigures = DashboardGoalMetrics & {
  /**
   * The dashboard's store (dashboardStore) and the spend its sales are set
   * against: every campaign's but the lead campaigns'.
   */
  store: (DashboardStore & { spend: number }) | null;
  /** Analytics in the range; null without Analytics in the scope. */
  analytics: ReportAnalyticsFigures | null;
};

/** Zeroed figures without a store or Analytics. */
export function emptyReportFigures(): ReportFigures {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    addToCart: 0,
    addToCartTracked: false,
    purchases: 0,
    revenue: 0,
    leads: 0,
    store: null,
    analytics: null,
  };
}

/** The ads figures of both added up; the site figures stay those of `a`. */
export function addAdsFigures(
  a: ReportFigures,
  b: ReportFigures,
): ReportFigures {
  return {
    ...a,
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    addToCart: a.addToCart + b.addToCart,
    addToCartTracked: a.addToCartTracked || b.addToCartTracked,
    purchases: a.purchases + b.purchases,
    revenue: a.revenue + b.revenue,
    leads: a.leads + b.leads,
  };
}

/** Analytics figures added up; null when neither has Analytics. */
export function addAnalytics(
  a: ReportAnalyticsFigures | null,
  b: ReportAnalyticsFigures | null,
): ReportAnalyticsFigures | null {
  if (!a || !b) {
    return a ?? b;
  }
  return {
    sessions: a.sessions + b.sessions,
    revenue: a.revenue + b.revenue,
    purchases: a.purchases + b.purchases,
    addToCart: a.addToCart + b.addToCart,
  };
}
