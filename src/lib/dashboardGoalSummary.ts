import type { GoogleAdsCampaignSummaryRow } from "@/components/dynamic-tables/GoogleAdsCampaignSection/types";
import {
  getSpendFromData,
  type FacebookCampaignRow,
  type RawAdsMetricData,
} from "@/lib/adsMetrics";
import { adsRowOutcomes } from "@/lib/adsRowOutcomes";
import {
  REPORT_CAMPAIGN_GOALS,
  type ReportCampaignGoal,
} from "@/lib/campaignGoals";

/** The ads platforms of a dashboard's breakdown; Facebook tables show as one. */
export type DashboardAdsPlatform = "facebook_insights" | "google_ads";

/** One goal's campaigns added up; results the goal is not measured on stay 0. */
export type DashboardGoalMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  addToCart: number;
  /** Whether the campaigns reported add-to-cart; Google Ads never does. */
  addToCartTracked: boolean;
  purchases: number;
  revenue: number;
  leads: number;
};

/** One platform's campaigns of one goal. */
export type DashboardGoalRow = {
  key: string;
  platform: DashboardAdsPlatform;
  goal: ReportCampaignGoal;
  metrics: DashboardGoalMetrics;
};

export type DashboardGoalSummary = {
  /** A row per platform and goal that has campaigns: sales, then leads, then traffic. */
  rows: DashboardGoalRow[];
  /** Each goal's totals across platforms. */
  goals: Record<ReportCampaignGoal, DashboardGoalMetrics>;
  /** Delivery and spend of every goal. */
  total: Pick<DashboardGoalMetrics, "spend" | "impressions" | "clicks">;
  hasEcommerce: boolean;
  hasLeads: boolean;
};

/**
 * A dashboard's ads campaigns by goal, from the campaign tables its platform
 * tabs show: Facebook as split for those tables (groupFacebookRowsByGoal on a
 * mixed table) and Google Ads by each campaign's own goal. Each goal adds only
 * what it is measured on (adsRowOutcomes, as in the shared table's KPIs), so a
 * lead campaign never adds revenue and a traffic campaign adds delivery and
 * spend only.
 */
export function summarizeDashboardGoals(platforms: {
  facebook: Record<ReportCampaignGoal, FacebookCampaignRow[]>;
  google: GoogleAdsCampaignSummaryRow[];
}): DashboardGoalSummary {
  const rows = REPORT_CAMPAIGN_GOALS.flatMap((goal) => [
    ...goalRows("facebook_insights", goal, platforms.facebook[goal]),
    ...goalRows(
      "google_ads",
      goal,
      platforms.google.filter((campaign) => campaign.goal === goal),
    ),
  ]);
  const totalOf = (goal: ReportCampaignGoal) =>
    sumMetrics(rows.filter((row) => row.goal === goal));
  const { spend, impressions, clicks } = sumMetrics(rows);
  return {
    rows,
    goals: {
      ecommerce: totalOf("ecommerce"),
      leads: totalOf("leads"),
      traffic: totalOf("traffic"),
    },
    total: { spend, impressions, clicks },
    hasEcommerce: rows.some((row) => row.goal === "ecommerce"),
    hasLeads: rows.some((row) => row.goal === "leads"),
  };
}

/** One platform's campaigns of a goal as a row; none when it has no campaigns. */
function goalRows(
  platform: DashboardAdsPlatform,
  goal: ReportCampaignGoal,
  campaigns: RawAdsMetricData[],
): DashboardGoalRow[] {
  if (campaigns.length === 0) {
    return [];
  }
  const metrics = emptyMetrics();
  for (const campaign of campaigns) {
    const outcomes = adsRowOutcomes(campaign, goal);
    metrics.spend += getSpendFromData(campaign);
    metrics.impressions += Number(campaign.impressions) || 0;
    metrics.clicks += Number(campaign.clicks) || 0;
    metrics.purchases += outcomes.purchases;
    metrics.revenue += outcomes.revenue;
    metrics.addToCart += outcomes.addToCart;
    metrics.leads += outcomes.leads;
    metrics.addToCartTracked ||= outcomes.addToCart > 0;
  }
  return [{ key: `${platform}:${goal}`, platform, goal, metrics }];
}

/** The rows' metrics added up. */
function sumMetrics(rows: DashboardGoalRow[]): DashboardGoalMetrics {
  return rows.reduce((sum, { metrics }) => {
    sum.spend += metrics.spend;
    sum.impressions += metrics.impressions;
    sum.clicks += metrics.clicks;
    sum.addToCart += metrics.addToCart;
    sum.addToCartTracked ||= metrics.addToCartTracked;
    sum.purchases += metrics.purchases;
    sum.revenue += metrics.revenue;
    sum.leads += metrics.leads;
    return sum;
  }, emptyMetrics());
}

/** Zeroed metrics. */
function emptyMetrics(): DashboardGoalMetrics {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    addToCart: 0,
    addToCartTracked: false,
    purchases: 0,
    revenue: 0,
    leads: 0,
  };
}
