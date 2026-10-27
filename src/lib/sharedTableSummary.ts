import {
  getAddToCartFromData,
  getAdsPurchasesFromData,
  getLeadsFromData,
  getPurchasesFromData,
  getRevenueFromData,
  getSessionsFromData,
  getSpendFromData,
  groupFacebookCampaigns,
  type FacebookCampaignRow,
} from "@/lib/adsMetrics";
import {
  aggregateFacebookRecordsAtLevel,
  getEntityGroupKey,
  type AdsEntityLevel,
} from "@/lib/adsEntityLevel";

type RecordData = Record<string, unknown>;

/** Goal of one campaign (or ad set / ad) in a shared report. */
export type SharedCampaignGoal = "ecommerce" | "leads" | "traffic";

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
    goalOf: ((data: RecordData) => SharedCampaignGoal) | null;
    goals: { ecommerce: boolean; leads: boolean } | null;
    forceLeadsOnly: boolean;
    forceEcommerceOnly: boolean;
  },
): SharedTableSummary {
  const { integrationType, goalOf, goals, forceLeadsOnly, forceEcommerceOnly } =
    options;
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
    if (goalOf) {
      const goal = goalOf(d);
      if (goal === "ecommerce") {
        ecommerceSpend += getSpendFromData(d);
        purchases += getAdsPurchasesFromData(d);
        revenue += getRevenueFromData(d);
        addToCart += getAddToCartFromData(d);
      } else if (goal === "leads") {
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
    hasEcommerce: goals ? goals.ecommerce : forceEcommerceOnly,
    hasLeads: goals ? goals.leads : forceLeadsOnly,
  };
}

/** The key the Facebook aggregation groups a record under at this level. */
function facebookEntityKey(data: RecordData, level: AdsEntityLevel): string {
  return level === "campaign"
    ? String(data.campaign_name || data.campaign || "ללא שם")
    : getEntityGroupKey(data, level);
}

/**
 * Facebook Insights rows of a shared report, split by goal the way the internal
 * report does (sales / leads / traffic), plus each record's goal for the KPIs.
 * A leads-only table (campaign_type leads) keeps every non-traffic row in leads.
 */
export function groupSharedFacebookRows(
  records: Array<{ data?: RecordData | null }>,
  level: AdsEntityLevel,
  options: { leadsOnly: boolean },
): {
  ecommerce: FacebookCampaignRow[];
  leads: FacebookCampaignRow[];
  traffic: FacebookCampaignRow[];
  goalOf: (data: RecordData) => SharedCampaignGoal;
} {
  const rows = aggregateFacebookRecordsAtLevel(records, level);
  const groups = groupFacebookCampaigns(rows, {
    forceLeadsOnly: options.leadsOnly,
  });
  const keyOf = (row: FacebookCampaignRow) =>
    level === "campaign"
      ? row.name
      : ((row as FacebookCampaignRow & { key?: string }).key ?? row.name);
  const goalByKey = new Map<string, SharedCampaignGoal>();
  for (const row of groups.ecommerce) goalByKey.set(keyOf(row), "ecommerce");
  for (const row of groups.leads) goalByKey.set(keyOf(row), "leads");
  for (const row of groups.traffic) goalByKey.set(keyOf(row), "traffic");
  return {
    ...groups,
    goalOf: (data) => goalByKey.get(facebookEntityKey(data, level)) ?? "leads",
  };
}
