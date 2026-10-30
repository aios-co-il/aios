import {
  getAddToCartFromData,
  getAdsPurchasesFromData,
  getLeadsFromData,
  getRevenueFromData,
  type RawAdsMetricData,
} from "@/lib/adsMetrics";
import type { GoogleCampaignGoal } from "../../../supabase/functions/_shared/pulse/google-campaign-goal.ts";

/**
 * What one ads row adds to a shared table's summary. A Google row adds only
 * what its campaign's goal measures, so a lead campaign's conversion value is
 * never revenue; a row without a goal adds everything and the table mode
 * filters the totals afterwards.
 */
export function adsRowOutcomes(
  data: RawAdsMetricData,
  goal?: GoogleCampaignGoal,
) {
  const sales = goal !== "leads";
  const leads = goal !== "ecommerce";
  return {
    purchases: sales ? getAdsPurchasesFromData(data) : 0,
    revenue: sales ? getRevenueFromData(data) : 0,
    addToCart: sales ? getAddToCartFromData(data) : 0,
    leads: leads ? getLeadsFromData(data) : 0,
  };
}
