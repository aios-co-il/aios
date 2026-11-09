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

/**
 * Add-to-cart per campaign/day, primary purchase/lead conversions per campaign,
 * and per campaign/day the phone-call leads Google counts only as secondary.
 */
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
  const secondaryCallsByCampaignDay = new Map<string, number>();
  const conversionsByCampaign = new Map<string, CampaignConversions>();
  for (const row of batches.flatMap((batch) => batch.results || [])) {
    const campaignId = row.campaign?.id ?? "";
    const category = row.segments?.conversionActionCategory;
    const dayKey = `${campaignId}|${row.segments?.date || ""}`;
    if (category === "ADD_TO_CART") {
      addToCartByCampaignDay.set(
        dayKey,
        (addToCartByCampaignDay.get(dayKey) || 0) +
          parseFloat(row.metrics?.allConversions || "0"),
      );
    }
    if (category === "PHONE_CALL_LEAD") {
      // Calls a secondary action counts sit in all_conversions only; a primary
      // call action is already in conversions, so this adds nothing for it.
      const secondary =
        parseFloat(row.metrics?.allConversions || "0") -
        parseFloat(row.metrics?.conversions || "0");
      if (secondary > 0) {
        secondaryCallsByCampaignDay.set(
          dayKey,
          (secondaryCallsByCampaignDay.get(dayKey) || 0) + secondary,
        );
      }
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
  return {
    addToCartByCampaignDay,
    conversionsByCampaign,
    secondaryCallsByCampaignDay,
  };
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
