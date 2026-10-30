import {
  aggregateGoogleRecordsAtLevel,
  type AdsEntityLevel,
} from "@/lib/adsEntityLevel";
import type {
  GoogleAdsRowData,
  GoogleReportRecord,
} from "@/lib/googleCampaignGoals";
import type { GoogleCampaignGoal } from "../../../supabase/functions/_shared/pulse/google-campaign-goal.ts";

/**
 * A shared Google Ads table's rows at one level (campaign, ad set or ad), split
 * by their campaign's goal: sales rows and lead rows show in separate tables.
 */
export function googleCampaignRowsByGoal(
  records: GoogleReportRecord[],
  level: AdsEntityLevel,
  goalOf: (data?: GoogleAdsRowData | null) => GoogleCampaignGoal,
) {
  const ecommerce = sharedTableGoogleRows(
    records.filter((record) => goalOf(record.data) === "ecommerce"),
    level,
  );
  const leads = sharedTableGoogleRows(
    records.filter((record) => goalOf(record.data) !== "ecommerce"),
    level,
  );
  return { ecommerce, leads, all: [...ecommerce, ...leads] };
}

/** One row per entity with the columns the shared table shows. */
function sharedTableGoogleRows(
  records: GoogleReportRecord[],
  level: AdsEntityLevel,
) {
  return aggregateGoogleRecordsAtLevel(records, level).map((c) => ({
    name: c.name,
    spend: c.cost || c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    leads: c.leads,
    purchases: c.purchases,
    revenue: c.conversions_value || c.purchase_value,
    addToCart: c.add_to_cart,
  }));
}
