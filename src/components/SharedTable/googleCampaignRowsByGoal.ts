import {
  aggregateGoogleRecordsAtLevel,
  type AdsEntityLevel,
  getEntityGroupKey,
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
      goal,
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

/**
 * One row per entity with the columns the shared table shows. A sales row's
 * leads are only the calls and forms the sync stores in `leads`: the generic
 * reader would fall back to its conversions, which are purchases.
 */
function sharedTableGoogleRows(
  records: GoogleReportRecord[],
  level: AdsEntityLevel,
  goal: GoogleReportGoal,
) {
  const salesLeads = new Map<string, number>();
  if (goal === "ecommerce") {
    for (const record of records) {
      const key = getEntityGroupKey(record.data, level);
      salesLeads.set(
        key,
        (salesLeads.get(key) ?? 0) + (Number(record.data?.leads) || 0),
      );
    }
  }
  return aggregateGoogleRecordsAtLevel(records, level).map((c) => ({
    name: c.name,
    spend: c.cost || c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    leads: goal === "ecommerce" ? (salesLeads.get(c.key) ?? 0) : c.leads,
    purchases: c.purchases,
    revenue: c.conversions_value || c.purchase_value,
    addToCart: c.add_to_cart,
  }));
}
