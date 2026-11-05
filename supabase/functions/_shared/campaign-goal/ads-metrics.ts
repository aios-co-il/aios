// Result counts of one report record (`crm_records.data`), for the reports,
// the dashboards and the pulse.
//
// Every integration writes its own field names — Facebook syncs write
// `purchases` / `purchase_value` / `add_to_cart`, Google Ads writes
// `conversions` / `conversions_value` to mirror the Google Ads UI columns, and
// Google Analytics writes `ecommercePurchases` / `purchaseRevenue` / `addToCarts`.
// These getters are the single place that maps those dialects to one metric, so
// the "All" tab breakdown, the per-platform tabs, the shared/public views, the
// agency dashboard and the pulse can never disagree about the same number again.

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
    if (value > 0) {
      return value;
    }
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
  if (conversations > 0) {
    return conversations;
  }
  const resultKind = String(data?.result_kind || "").toLowerCase();
  if (
    ["conversations", "messages", "messaging_conversations"].includes(
      resultKind,
    )
  ) {
    const results = Number(data?.results);
    if (results > 0) {
      return results;
    }
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
