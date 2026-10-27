import { shouldIncludeInAdsDashboardAggregate } from "@/lib/adsEntityLevel";
import type { ReportCampaignGoal } from "@/lib/campaignGoals";
import { metaObjectiveGoal } from "../../supabase/functions/_shared/meta-ads/campaign-objectives.ts";

// Shared metric extraction for report records (`crm_records.data`).
//
// Every integration writes its own field names — Facebook syncs write
// `purchases` / `purchase_value` / `add_to_cart`, Google Ads writes
// `conversions` / `conversions_value` to mirror the Google Ads UI columns, and
// Google Analytics writes `ecommercePurchases` / `purchaseRevenue` / `addToCarts`.
// These getters are the single place that maps those dialects to one metric, so
// the "All" tab breakdown, the per-platform tabs, the shared/public views and
// the agency dashboard can never disagree about the same number again.

/** Integration metrics are coerced at the existing numeric-extraction boundary. */
export type RawAdsMetricData = Record<string, unknown>;

/** Campaign aggregation also relies on stable string metadata. */
export type AdsMetricData = RawAdsMetricData & {
  campaign_name?: string | null;
  campaign?: string | null;
  campaign_type?: string;
  campaign_objective?: string | null;
  result_kind?: string | null;
};

type NullableRawAdsMetricData = RawAdsMetricData | null | undefined;
type NullableAdsMetricData = AdsMetricData | null | undefined;

export const FACEBOOK_FORM_LEAD_ACTION_KEYS = [
  "form_leads",
  "leadgen.other",
  "leadgen_grouped",
  "onsite_conversion.lead_grouped",
] as const;

export const getFacebookFormLeadsFromData = (
  data: NullableRawAdsMetricData,
) => {
  for (const key of FACEBOOK_FORM_LEAD_ACTION_KEYS) {
    const value = Number(data?.[key]);
    if (value > 0) return value;
  }
  return 0;
};

export const getExplicitLeadFieldsFromData = (data: NullableRawAdsMetricData) =>
  getFacebookFormLeadsFromData(data) ||
  Number(data?.leads) ||
  Number(data?.website_leads) ||
  Number(data?.offsite_conversion) ||
  Number(data?.offsite_conversion_fb_pixel_lead) ||
  0;

export const getMessagingLeadsFromData = (data: NullableRawAdsMetricData) => {
  const conversations =
    Number(data?.conversations) ||
    Number(data?.messages) ||
    Number(data?.messaging_conversations) ||
    0;
  if (conversations > 0) return conversations;
  const resultKind = String(data?.result_kind || "").toLowerCase();
  if (
    ["conversations", "messages", "messaging_conversations"].includes(
      resultKind,
    )
  ) {
    const results = Number(data?.results);
    if (results > 0) return results;
  }
  return 0;
};

export const getLeadsFromData = (data: NullableRawAdsMetricData) =>
  Number(data?.leads) ||
  getFacebookFormLeadsFromData(data) ||
  getMessagingLeadsFromData(data) ||
  Number(data?.conversions) ||
  Number(data?.website_leads) ||
  Number(data?.offsite_conversion) ||
  Number(data?.offsite_conversion_fb_pixel_lead) ||
  0;

export const getSpendFromData = (data: NullableRawAdsMetricData) =>
  Number(data?.spend) || Number(data?.cost) || 0;

/** Ecommerce revenue — purchase value first (GA4 purchaseRevenue), then broader totals. */
export const getRevenueFromData = (data: NullableRawAdsMetricData) =>
  Number(data?.purchase_value) ||
  Number(data?.purchaseRevenue) ||
  Number(data?.total_revenue) ||
  Number(data?.conversions_value) ||
  Number(data?.conversion_value) ||
  0;

/** Purchases as reported by Analytics / WooCommerce-style records. */
export const getPurchasesFromData = (data: NullableRawAdsMetricData) =>
  Number(data?.purchases) ||
  Number(data?.ecommercePurchases) ||
  Number(data?.transactions) ||
  0;

/**
 * Purchases for an ecommerce ADS record (Facebook / Google Ads).
 *
 * `sync-google-ads-data` stores the campaign's conversions under `conversions`
 * so the report matches the Google Ads UI "Conversions" column, and never
 * writes a `purchases` field. Counting `purchases` alone therefore reports 0
 * purchases for a Google Ads ecommerce table even though its revenue — which
 * already falls back to `conversions_value` — is fully populated.
 */
export const getAdsPurchasesFromData = (data: NullableRawAdsMetricData) =>
  getPurchasesFromData(data) || Number(data?.conversions) || 0;

const ADD_TO_CART_KEYS = ["add_to_cart", "addToCarts"] as const;

export const getAddToCartFromData = (data: NullableRawAdsMetricData) =>
  Number(data?.add_to_cart) || Number(data?.addToCarts) || 0;

/**
 * Whether the record's source reports add-to-cart at all. Google Ads campaign
 * reports carry no add-to-cart metric, so a summed 0 there means "not tracked"
 * rather than "nobody added to cart" and should be rendered as unavailable.
 */
export const hasAddToCartMetric = (data: NullableRawAdsMetricData) =>
  !!data &&
  ADD_TO_CART_KEYS.some((key) => data[key] !== undefined && data[key] !== null);

export const getSessionsFromData = (data: NullableRawAdsMetricData) =>
  Number(data?.sessions) || 0;

export const getUsersFromData = (data: NullableRawAdsMetricData) =>
  Number(data?.users) || 0;

export type FacebookCampaignRow = {
  name: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  purchases: number;
  purchase_value: number;
  add_to_cart: number;
  campaign_type?: string;
  campaign_objective?: string | null;
  result_kind?: string | null;
  result?: { result_kind?: string | null } | null;
};

/** Result kinds that belong on the ecommerce table, next to leads when both fire. */
export const FACEBOOK_ECOMMERCE_RESULT_KINDS = new Set([
  "purchases",
  "initiate_checkout",
  "add_to_cart",
  "add_payment_info",
  "view_content",
  "search",
]);

/** A Facebook campaign's type as the Meta sync stores it. */
export type FacebookCampaignType = "lead" | "ecommerce" | "traffic" | "other";

const FACEBOOK_CAMPAIGN_TYPE_RANK: Record<string, number> = {
  ecommerce: 3,
  lead: 2,
  traffic: 1,
  other: 0,
};

/** Same campaign can be labeled lead on some days and ecommerce on others. Sales wins. */
export function preferFacebookCampaignType(
  current: string | undefined,
  next: string | undefined,
): FacebookCampaignType {
  const cur = String(current || "other").toLowerCase();
  const nxt = String(next || "other").toLowerCase();
  const winner =
    (FACEBOOK_CAMPAIGN_TYPE_RANK[nxt] ?? 0) >
    (FACEBOOK_CAMPAIGN_TYPE_RANK[cur] ?? 0)
      ? nxt
      : cur;
  if (winner === "ecommerce" || winner === "lead" || winner === "traffic")
    return winner;
  return "other";
}

/** The fields of a Facebook campaign that decide whether it is a sales campaign. */
export type FacebookSalesSignals = Pick<
  FacebookCampaignRow,
  | "campaign_type"
  | "campaign_objective"
  | "result_kind"
  | "result"
  | "leads"
  | "purchases"
  | "purchase_value"
>;

/**
 * Whether a Facebook campaign (a row or a campaign's totals) is a sales campaign.
 * An explicit sales campaign stays ecommerce when the pixel also fires leads
 * and purchases are still zero, so the report can show both on one row.
 */
export function isFacebookEcommerceCampaign(
  data: FacebookSalesSignals,
): boolean {
  const rowType = String(data.campaign_type || "").toLowerCase();
  if (rowType === "traffic") return false;
  if (rowType === "ecommerce") return true;
  if (metaObjectiveGoal(data.campaign_objective) === "ecommerce") {
    return true;
  }
  const resultKind = String(
    data.result_kind || data.result?.result_kind || "",
  ).toLowerCase();
  if (FACEBOOK_ECOMMERCE_RESULT_KINDS.has(resultKind)) return true;
  // A lead campaign stays a lead campaign even when the pixel reports a stray purchase.
  if (rowType === "lead") return false;
  return (
    (data.purchases > 0 || data.purchase_value > 0) &&
    !(data.leads > 0 && data.purchases === 0 && data.purchase_value === 0)
  );
}

export function isFacebookMessagingLeadRecord(
  data: NullableAdsMetricData,
): boolean {
  const name = String(
    data?.campaign_name || data?.campaign || data?.name || "",
  );
  if (/whatsapp|ווטסאפ|וואטסאפ|מסנג|messenger|click.?to.?message/i.test(name))
    return true;
  const optimization = String(data?.optimization_goal || "").toUpperCase();
  if (/MESSAGE|CONVERSATION|WHATSAPP|MESSENGER/.test(optimization)) return true;
  const resultKind = String(data?.result_kind || "").toLowerCase();
  if (
    ["conversations", "messages", "messaging_conversations"].includes(
      resultKind,
    )
  )
    return true;
  const objective = String(
    data?.campaign_objective || data?.objective || "",
  ).toUpperCase();
  if (
    /OUTCOME_ENGAGEMENT|MESSAGES/.test(objective) &&
    getMessagingLeadsFromData(data) > 0
  )
    return true;
  if (
    /OUTCOME_ENGAGEMENT|MESSAGES/.test(objective) &&
    /whatsapp|ווטסאפ|וואטסאפ/i.test(name)
  )
    return true;
  return false;
}

/** Meta campaign objective → report kind; null when the objective does not decide it. */
export function facebookObjectiveKind(
  data: NullableAdsMetricData,
): "lead" | "ecommerce" | null {
  // Sales campaigns stay ecommerce; their leads/conversations show on the same row.
  const goal = metaObjectiveGoal(data?.campaign_objective || data?.objective);
  return goal === "leads" ? "lead" : goal;
}

/**
 * The Meta objective decides when it is known (stored campaign_type may be stale or
 * mislabeled by older syncs). Otherwise: stored rows may still say traffic until the
 * next Meta sync — WhatsApp/messaging belongs in leads.
 */
export function effectiveFacebookCampaignType(
  data: NullableAdsMetricData,
): FacebookCampaignType {
  const byObjective = facebookObjectiveKind(data);
  if (byObjective) return byObjective;
  const rowType = String(data?.campaign_type || "").toLowerCase();
  if (rowType === "traffic" && isFacebookMessagingLeadRecord(data))
    return "lead";
  if (rowType === "ecommerce" || rowType === "lead" || rowType === "traffic")
    return rowType;
  return "other";
}

export function isFacebookTrafficCampaign(data: FacebookCampaignRow): boolean {
  return effectiveFacebookCampaignType(data) === "traffic";
}

/**
 * Split aggregated Facebook campaigns into a single ecommerce or leads table
 * plus traffic, for dashboards without a mixed Facebook table. Mixed tables
 * split by groupFacebookRowsByGoal, like the reports.
 */
export function groupFacebookCampaigns(
  campaigns: FacebookCampaignRow[],
  options: { singleTableMode: "ecommerce" | "leads" },
): {
  ecommerce: FacebookCampaignRow[];
  leads: FacebookCampaignRow[];
  traffic: FacebookCampaignRow[];
} {
  const traffic = campaigns.filter(isFacebookTrafficCampaign);
  const nonTraffic = campaigns.filter((c) => !isFacebookTrafficCampaign(c));

  if (options.singleTableMode === "ecommerce") {
    // An ecommerce report can still run lead campaigns (e.g. recruiting) — show them as leads.
    const isLead = (c: FacebookCampaignRow) =>
      String(c.campaign_type || "").toLowerCase() === "lead";
    return {
      ecommerce: nonTraffic.filter((c) => !isLead(c)),
      leads: nonTraffic.filter(isLead),
      traffic,
    };
  }
  return { ecommerce: [], leads: nonTraffic, traffic };
}

/** The key Facebook campaign rows are aggregated under: the campaign's name. */
export function facebookCampaignKey(data: NullableAdsMetricData): string {
  return data?.campaign_name || data?.campaign || "ללא שם";
}

/** Aggregate facebook_insights / facebook_ecommerce records by campaign name. */
export function aggregateFacebookCampaignsFromRecords(
  records: Array<{ data?: NullableAdsMetricData }>,
): FacebookCampaignRow[] {
  const map: Record<string, FacebookCampaignRow> = {};

  records.forEach((r) => {
    if (!shouldIncludeInAdsDashboardAggregate(r.data, "facebook_insights"))
      return;
    const d = r.data || {};
    const name = facebookCampaignKey(d);
    if (!map[name]) {
      map[name] = {
        name,
        impressions: 0,
        clicks: 0,
        spend: 0,
        leads: 0,
        purchases: 0,
        purchase_value: 0,
        add_to_cart: 0,
      };
    }
    map[name].impressions += Number(d.impressions) || 0;
    map[name].clicks += Number(d.clicks) || 0;
    map[name].spend += getSpendFromData(d);
    map[name].leads += getLeadsFromData(d);
    map[name].purchases += getAdsPurchasesFromData(d);
    map[name].purchase_value += getRevenueFromData(d);
    map[name].add_to_cart += getAddToCartFromData(d);
    const rowType = effectiveFacebookCampaignType(d);
    if (
      rowType === "ecommerce" ||
      rowType === "lead" ||
      rowType === "traffic"
    ) {
      map[name].campaign_type = preferFacebookCampaignType(
        map[name].campaign_type,
        rowType,
      );
    }
  });

  return Object.values(map).sort((a, b) => b.spend - a.spend);
}

/** Classify an aggregated Facebook campaign row (same rules as DynamicTableView). */
export function classifyFacebookCampaignTotals(totals: {
  leads?: number;
  purchases?: number;
  purchase_value?: number;
  revenue?: number;
  campaign_type?: string;
}): ReportCampaignGoal {
  const rowType = String(totals.campaign_type || "").toLowerCase();
  if (rowType === "traffic") return "traffic";
  if (rowType === "lead") return "leads";
  const row: FacebookSalesSignals = {
    leads: Number(totals.leads) || 0,
    purchases: Number(totals.purchases) || 0,
    purchase_value:
      Number(totals.purchase_value) || Number(totals.revenue) || 0,
    campaign_type: totals.campaign_type,
  };
  return isFacebookEcommerceCampaign(row) ? "ecommerce" : "leads";
}

export function isFacebookLeadsOnlyTable(
  integrationSettings?: Record<string, unknown> | null,
): boolean {
  const t = String(integrationSettings?.campaign_type || "").toLowerCase();
  return t === "leads" || t === "lead";
}

/** facebook_insights tables without an explicit leads-only flag show both ecom + lead campaigns. */
export function facebookTableUsesMixedRows(
  integrationType?: string | null,
  integrationSettings?: Record<string, unknown> | null,
): boolean {
  if (integrationType !== "facebook_insights") return false;
  return !isFacebookLeadsOnlyTable(integrationSettings);
}

export type FacebookCampaignGroupSummary = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  addToCart: number;
  roas: number;
  cpl: number;
};

/** Sum aggregated Facebook campaigns into one platform-breakdown row (All tab). */
export function summarizeFacebookCampaignGroup(
  campaigns: FacebookCampaignRow[],
): FacebookCampaignGroupSummary {
  const totals = campaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + c.spend,
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      leads: acc.leads + c.leads,
      purchases: acc.purchases + c.purchases,
      revenue: acc.revenue + c.purchase_value,
      addToCart: acc.addToCart + c.add_to_cart,
    }),
    {
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0,
      purchases: 0,
      revenue: 0,
      addToCart: 0,
    },
  );
  return {
    ...totals,
    roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
    cpl: totals.leads > 0 ? totals.spend / totals.leads : 0,
  };
}
