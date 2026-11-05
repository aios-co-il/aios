import { conversionCategorySide } from "./conversion-goal.ts";

/** The fields the enrichment queries select, as searchStream returns them. */
export type GaqlRow = {
  campaign?: { id?: string };
  segments?: { date?: string; conversionActionCategory?: string };
  metrics?: { conversions?: string; allConversions?: string };
  campaignConversionGoal?: { category?: string; biddable?: boolean };
};

export type RunGaqlSearch = (
  query: string,
) => Promise<Array<{ results?: GaqlRow[] }>>;

export type CampaignConversions = {
  purchaseConversions: number;
  leadConversions: number;
};

/** Add-to-cart per campaign/day and primary purchase/lead conversions per campaign. */
export async function fetchCategoryConversions(
  runGaqlSearch: RunGaqlSearch,
  startIso: string,
  endIso: string,
) {
  const batches = await runGaqlSearch(`
    SELECT
      segments.date,
      campaign.id,
      segments.conversion_action_category,
      metrics.conversions,
      metrics.all_conversions
    FROM campaign
    WHERE segments.date BETWEEN '${startIso}' AND '${endIso}'
  `);
  const addToCartByCampaignDay = new Map<string, number>();
  const conversionsByCampaign = new Map<string, CampaignConversions>();
  for (const row of batches.flatMap((batch) => batch.results || [])) {
    const campaignId = row.campaign?.id ?? "";
    const category = row.segments?.conversionActionCategory;
    if (category === "ADD_TO_CART") {
      const key = `${campaignId}|${row.segments?.date || ""}`;
      addToCartByCampaignDay.set(
        key,
        (addToCartByCampaignDay.get(key) || 0) +
          parseFloat(row.metrics?.allConversions || "0"),
      );
    }
    const side = conversionCategorySide(category);
    if (!side) {
      continue;
    }
    const totals = conversionsByCampaign.get(campaignId) || {
      purchaseConversions: 0,
      leadConversions: 0,
    };
    const value = parseFloat(row.metrics?.conversions || "0");
    if (side === "ecommerce") {
      totals.purchaseConversions += value;
    } else {
      totals.leadConversions += value;
    }
    conversionsByCampaign.set(campaignId, totals);
  }
  return { addToCartByCampaignDay, conversionsByCampaign };
}

/** Categories each campaign bids on; empty when the goal query fails, so conversions decide. */
export async function fetchBiddableCategories(runGaqlSearch: RunGaqlSearch) {
  const biddableByCampaign = new Map<string, string[]>();
  try {
    const batches = await runGaqlSearch(`
      SELECT
        campaign.id,
        campaign_conversion_goal.category,
        campaign_conversion_goal.biddable
      FROM campaign_conversion_goal
    `);
    for (const row of batches.flatMap((batch) => batch.results || [])) {
      if (!row.campaignConversionGoal?.biddable) {
        continue;
      }
      const campaignId = row.campaign?.id ?? "";
      const list = biddableByCampaign.get(campaignId) || [];
      list.push(row.campaignConversionGoal.category ?? "");
      biddableByCampaign.set(campaignId, list);
    }
  } catch (goalErr) {
    console.warn(
      "[sync-google-ads] campaign conversion goals failed (non-fatal):",
      goalErr instanceof Error
        ? goalErr.message
        : JSON.stringify(goalErr).slice(0, 300),
    );
  }
  return biddableByCampaign;
}
