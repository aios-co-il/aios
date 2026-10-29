import {
  getAddToCartFromData,
  getAdsPurchasesFromData,
  getLeadsFromData,
  getRevenueFromData,
  type RawAdsMetricData,
} from "./ads-metrics.ts";
import type { ReportCampaignGoal } from "./report-goals.ts";

/**
 * What one ads row adds to a shared table's summary. A row with a goal (Google
 * Ads, or Facebook Insights split by goal) adds only what that goal measures:
 * a lead campaign's conversion value is never revenue, and a traffic campaign
 * adds neither. A row without a goal adds everything and the table mode filters
 * the totals afterwards.
 */
export function adsRowOutcomes(
  data: RawAdsMetricData,
  goal?: ReportCampaignGoal,
) {
  const sales = goal === undefined || goal === "ecommerce";
  const leads = goal === undefined || goal === "leads";
  return {
    purchases: sales ? getAdsPurchasesFromData(data) : 0,
    revenue: sales ? getRevenueFromData(data) : 0,
    addToCart: sales ? getAddToCartFromData(data) : 0,
    leads: leads ? getLeadsFromData(data) : 0,
  };
}

/**
 * The results one row adds to its campaign, as the reports count them:
 * purchases for a sales campaign, leads for a lead campaign, and none (null)
 * for a traffic campaign, which the reports measure by delivery and spend only.
 * A missing or zero field is a real 0, as the report shows it.
 */
export function goalResultCount(
  data: RawAdsMetricData,
  goal: ReportCampaignGoal,
): number | null {
  if (goal === "traffic") {
    return null;
  }
  const outcomes = adsRowOutcomes(data, goal);
  return goal === "ecommerce" ? outcomes.purchases : outcomes.leads;
}
