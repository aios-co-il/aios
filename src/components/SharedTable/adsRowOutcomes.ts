import {
  getAddToCartFromData,
  getAdsPurchasesFromData,
  getLeadsFromData,
  getRevenueFromData,
  type RawAdsMetricData,
} from "@/lib/adsMetrics";
import type { CampaignGoal } from "@/lib/campaignGoals";

/**
 * What one ads row adds to a shared table's summary. A row with a goal (Google
 * Ads, or Facebook Insights split by goal) adds only what that goal measures:
 * a lead campaign's conversion value is never revenue, and a traffic campaign
 * adds neither. A row without a goal adds everything and the table mode filters
 * the totals afterwards.
 */
export function adsRowOutcomes(data: RawAdsMetricData, goal?: CampaignGoal) {
  const sales = goal === undefined || goal === "ecommerce";
  const leads = goal === undefined || goal === "leads";
  return {
    purchases: sales ? getAdsPurchasesFromData(data) : 0,
    revenue: sales ? getRevenueFromData(data) : 0,
    addToCart: sales ? getAddToCartFromData(data) : 0,
    leads: leads ? getLeadsFromData(data) : 0,
  };
}
