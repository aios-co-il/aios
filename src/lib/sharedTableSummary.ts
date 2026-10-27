import {
  getAddToCartFromData,
  getAdsPurchasesFromData,
  getLeadsFromData,
  getPurchasesFromData,
  getRevenueFromData,
  getSessionsFromData,
  getSpendFromData,
} from "@/lib/adsMetrics";
import type { GoogleReportCampaignGoal } from "@/lib/pulseCampaignGoals";

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
 * KPI totals of a shared integration table. Google Ads campaigns count toward
 * their own goal only: ROAS over sales campaigns' spend, cost per conversion
 * over lead campaigns' spend.
 */
export function summarizeSharedTableRecords(
  records: Array<{ data?: RecordData | null }>,
  options: {
    integrationType: string;
    /** Goal of a Google Ads record; null for other platforms. */
    googleGoalOf: ((data: RecordData) => GoogleReportCampaignGoal) | null;
    googleGoals: { ecommerce: boolean; leads: boolean } | null;
    forceLeadsOnly: boolean;
    forceEcommerceOnly: boolean;
  },
): SharedTableSummary {
  const {
    integrationType,
    googleGoalOf,
    googleGoals,
    forceLeadsOnly,
    forceEcommerceOnly,
  } = options;
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
    spend += getSpendFromData(d);
    impressions += Number(d.impressions) || 0;
    clicks += Number(d.clicks) || 0;
    if (googleGoalOf) {
      if (googleGoalOf(d) === "ecommerce") {
        ecommerceSpend += getSpendFromData(d);
        purchases += getAdsPurchasesFromData(d);
        revenue += getRevenueFromData(d);
        addToCart += getAddToCartFromData(d);
      } else {
        leadSpend += getSpendFromData(d);
        leads += getLeadsFromData(d);
      }
      continue;
    }
    purchases += getAdsPurchasesFromData(d);
    revenue += getRevenueFromData(d);
    addToCart += getAddToCartFromData(d);
    leads += getLeadsFromData(d);
  }

  // Round leads (Google Ads conversions can be fractional)
  leads = Math.round(leads);

  // Honor table-level overrides
  if (forceLeadsOnly) {
    purchases = 0;
    revenue = 0;
    addToCart = 0;
  }
  if (forceEcommerceOnly) {
    leads = 0;
  }

  const roasSpend = googleGoalOf ? ecommerceSpend : spend;
  const cplSpend = googleGoalOf ? leadSpend : spend;
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
    hasEcommerce: googleGoals ? googleGoals.ecommerce : forceEcommerceOnly,
    hasLeads: googleGoals ? googleGoals.leads : forceLeadsOnly,
  };
}
