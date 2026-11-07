import {
  aggregateGoogleRecordsAtLevel,
  type AdsEntityLevel,
} from "@/lib/adsEntityLevel";
import type {
  GoogleAdsRowData,
  GoogleReportRecord,
} from "@/lib/googleCampaignGoals";
import type { GoogleReportGoal } from "../../../supabase/functions/_shared/campaign-goal/google-classify.ts";

/**
 * A shared Google Ads table's rows at one level (campaign, ad set or ad), split
 * by their campaign's goal: sales, lead and exposure (traffic, AIO-496) rows
 * show in separate tables.
 */
export function googleCampaignRowsByGoal(
  records: GoogleReportRecord[],
  level: AdsEntityLevel,
  goalOf: (data?: GoogleAdsRowData | null) => GoogleReportGoal,
) {
  const rowsOf = (goal: GoogleReportGoal) =>
    sharedTableGoogleRows(
      records.filter((record) => goalOf(record.data) === goal),
      level,
    );
  const ecommerce = rowsOf("ecommerce");
  const leads = rowsOf("leads");
  const traffic = rowsOf("traffic");
  return {
    ecommerce,
    leads,
    traffic,
    all: [...ecommerce, ...leads, ...traffic],
  };
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
