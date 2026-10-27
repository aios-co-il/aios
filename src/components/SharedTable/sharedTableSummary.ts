import {
  getAddToCartFromData,
  getPurchasesFromData,
  getRevenueFromData,
  getSessionsFromData,
  getSpendFromData,
} from "@/lib/adsMetrics";
import type { ReportCampaignGoal } from "@/lib/campaignGoals";
import type { GoogleGoalPresence } from "@/lib/googleGoalPresence";
import { adsRowOutcomes } from "./adsRowOutcomes";

type RecordData = Record<string, unknown>;

export type SharedTableSummary = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  sessions: number;
  purchases: number;
  revenue: number;
  addToCart: number;
  roas: number;
  cpl: number;
  hasEcommerce: boolean;
  hasLeads: boolean;
};

/**
 * KPI totals of a shared integration table. When each campaign has its own goal
 * (Google Ads, mixed Facebook), it counts toward that goal only: ROAS over sales
 * campaigns' spend, cost per lead over lead campaigns' spend. Traffic campaigns
 * add to delivery and spend only.
 */
export function summarizeSharedTableRecords(
  records: Array<{ data?: RecordData | null }>,
  options: {
    integrationType: string;
    /** Goal of a record's campaign; null when the table has a single goal. */
    goalOf: ((data: RecordData) => ReportCampaignGoal) | null;
    /** Goals the table shows; a goal it does not show has its totals zeroed. */
    goals: GoogleGoalPresence;
  },
): SharedTableSummary {
  const { integrationType, goalOf, goals } = options;
  const isAnalytics = integrationType === "google_analytics";
  let spend = 0,
    impressions = 0,
    clicks = 0,
    leads = 0,
    sessions = 0;
  let purchases = 0,
    revenue = 0,
    addToCart = 0;
  let ecommerceSpend = 0,
    leadSpend = 0;

  for (const record of records) {
    const d = record.data || {};
    if (isAnalytics) {
      sessions += getSessionsFromData(d);
      purchases += getPurchasesFromData(d);
      revenue += getRevenueFromData(d);
      addToCart += getAddToCartFromData(d);
      continue;
    }
    const rowSpend = getSpendFromData(d);
    spend += rowSpend;
    impressions += Number(d.impressions) || 0;
    clicks += Number(d.clicks) || 0;
    const goal = goalOf?.(d);
    if (goal === "ecommerce") {
      ecommerceSpend += rowSpend;
    } else if (goal === "leads") {
      leadSpend += rowSpend;
    }
    const outcomes = adsRowOutcomes(d, goal);
    purchases += outcomes.purchases;
    revenue += outcomes.revenue;
    addToCart += outcomes.addToCart;
    leads += outcomes.leads;
  }

  // Round leads (Google Ads conversions can be fractional)
  leads = Math.round(leads);

  // Honor table-level overrides
  if (!goals.hasEcommerce) {
    purchases = 0;
    revenue = 0;
    addToCart = 0;
  }
  if (!goals.hasLeads) {
    leads = 0;
  }

  const roasSpend = goalOf ? ecommerceSpend : spend;
  const cplSpend = goalOf ? leadSpend : spend;
  return {
    spend,
    impressions,
    clicks,
    leads,
    sessions,
    purchases,
    revenue,
    addToCart,
    roas: roasSpend > 0 ? revenue / roasSpend : 0,
    cpl: leads > 0 ? cplSpend / leads : 0,
    hasEcommerce: goals.hasEcommerce,
    hasLeads: goals.hasLeads,
  };
}
