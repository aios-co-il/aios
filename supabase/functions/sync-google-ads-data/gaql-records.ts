import type { GoogleCampaignGoal } from "../_shared/pulse/google-campaign-goal.ts";

/** One synced Google Ads row, stored as the record's `data` JSON. */
export interface GoogleAdsRecord {
  date: string;
  entity_level?: "campaign" | "adset" | "ad";
  campaign_id: string;
  campaign_name: string;
  /**
   * The campaign's status (`ENABLED` / `PAUSED` / `REMOVED`) when the sync ran.
   * Google reports the current status, not the status on `date`, so readers
   * take it from the campaign's latest row (`campaignOffKeys`).
   */
  campaign_status?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cost: number;
  conversions: number;
  conversions_value: number;
  /** Secondary/all conversion actions (not used for primary KPI; stored for diagnostics). */
  all_conversions: number;
  all_conversions_value: number;
  cost_per_conversion: number;
  roas: number;
  /**
   * Add-to-cart conversions, from the ADD_TO_CART conversion action category.
   * Left undefined when the account tracks no add-to-cart action at all, so the
   * report can tell "not tracked" apart from "nobody added to cart".
   */
  add_to_cart?: number;
  /** Campaign type (PERFORMANCE_MAX, SEARCH, SHOPPING…) and bidding, for goal detection. */
  campaign_channel_type?: string;
  bidding_strategy_type?: string;
  /** What the campaign converts on, from its conversion goals: drives the pulse goal. */
  conversion_goal?: GoogleCampaignGoal;
  // Verified leads from connected WordPress site (Elementor submissions with matching gad_campaignid)
  verified_leads?: number;
  verified_source?: string; // site URL we verified against, for transparency
}

/** One row of a Google Ads `searchStream` batch, in the fields the sync selects. */
export type GaqlResultRow = {
  segments?: { date?: string };
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
    biddingStrategyType?: string;
  };
  adGroup?: { id?: string; name?: string };
  adGroupAd?: { ad?: { id?: string; name?: string } };
  metrics?: {
    impressions?: string;
    clicks?: string;
    ctr?: string | number;
    averageCpc?: string | number;
    costMicros?: string;
    conversions?: string | number;
    conversionsValue?: string | number;
    allConversions?: string | number;
    allConversionsValue?: string | number;
    costPerConversion?: string | number;
  };
};

/** One `searchStream` batch. */
export type GaqlBatch = { results?: GaqlResultRow[] };

/** The metrics every campaign, ad group and ad query selects. */
export const GAQL_METRICS = `
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.all_conversions,
        metrics.all_conversions_value,
        metrics.cost_per_conversion`;

/** Maps `searchStream` batches to synced records at one entity level. */
export function parseGaqlResults(
  batches: GaqlBatch[],
  entityLevel: "campaign" | "adset" | "ad",
): GoogleAdsRecord[] {
  return batches.flatMap((batch) =>
    (batch.results || []).map((result) => toRecord(result, entityLevel)),
  );
}

function toRecord(
  result: GaqlResultRow,
  entityLevel: "campaign" | "adset" | "ad",
): GoogleAdsRecord {
  const metrics = result.metrics ?? {};
  const cost = parseInt(metrics.costMicros || "0") / 1000000;
  const conversionsValue = parseFloat(String(metrics.conversionsValue || "0"));
  const roas = cost > 0 ? conversionsValue / cost : 0;
  return {
    entity_level: entityLevel,
    date: result.segments?.date || "",
    campaign_id: result.campaign?.id || "",
    campaign_name: result.campaign?.name || "",
    campaign_status: result.campaign?.status || undefined,
    campaign_channel_type: result.campaign?.advertisingChannelType || undefined,
    bidding_strategy_type: result.campaign?.biddingStrategyType || undefined,
    adset_id: result.adGroup?.id || undefined,
    adset_name: result.adGroup?.name || undefined,
    ad_id: result.adGroupAd?.ad?.id || undefined,
    ad_name: result.adGroupAd?.ad?.name || undefined,
    impressions: parseInt(metrics.impressions || "0"),
    clicks: parseInt(metrics.clicks || "0"),
    ctr: parseFloat(String(metrics.ctr || "0")) * 100,
    cpc: parseInt(String(metrics.averageCpc || "0")) / 1000000,
    cost,
    conversions: parseFloat(String(metrics.conversions || "0")),
    conversions_value: conversionsValue,
    all_conversions: parseFloat(String(metrics.allConversions || "0")),
    all_conversions_value: parseFloat(
      String(metrics.allConversionsValue || "0"),
    ),
    cost_per_conversion:
      parseInt(String(metrics.costPerConversion || "0")) / 1000000,
    roas: Math.round(roas * 100) / 100,
  };
}
