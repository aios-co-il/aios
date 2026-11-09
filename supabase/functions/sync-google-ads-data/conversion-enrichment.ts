import type { GoogleCampaignGoal } from "../_shared/campaign-goal/google-classify.ts";
import { fetchUncountedCallsByCampaignDay } from "./call-leads.ts";
import { googleCampaignConversionGoal } from "./conversion-goal.ts";
import {
  type CampaignConversions,
  fetchBiddableCategories,
  fetchCategoryConversions,
  type RunGaqlSearch,
} from "./conversion-gaql.ts";

/** The fields of a synced Google Ads record that the enrichment reads or writes. */
export type ConversionEnrichedRecord = {
  date: string;
  entity_level?: "campaign" | "adset" | "ad";
  campaign_id: string;
  add_to_cart?: number;
  conversion_goal?: GoogleCampaignGoal;
  conversions?: number;
  cost?: number;
  cost_per_conversion?: number;
  /** Phone calls added to `conversions` that Google left out of it. */
  added_call_leads?: number;
};

export type ConversionEnrichmentContext = {
  runGaqlSearch: RunGaqlSearch;
  startIso: string;
  endIso: string;
  /** The report table's `integration_settings.campaign_type`. */
  campaignType?: unknown;
};

/**
 * Stamp each record with the goal its campaign converts on, and add-to-cart on
 * ecommerce tables. Performance Max and Search carry no objective, so the pulse
 * check reads `conversion_goal` to tell an ecommerce campaign from a lead campaign
 * inside the same account. Add-to-cart is usually a SECONDARY action, so it lives
 * in `all_conversions`; purchases stay on `metrics.conversions` so the report keeps
 * matching the Google Ads UI. Every phone call is a lead, so a lead campaign's
 * conversions add the calls Google left out of them.
 */
export async function enrichConversionCategories(
  records: ConversionEnrichedRecord[],
  context: ConversionEnrichmentContext,
): Promise<void> {
  try {
    const { addToCartByCampaignDay, conversionsByCampaign } =
      await fetchCategoryConversions(
        context.runGaqlSearch,
        context.startIso,
        context.endIso,
      );
    const biddableByCampaign = await fetchBiddableCategories(
      context.runGaqlSearch,
    );
    const goalCount = stampConversionGoals(
      records,
      conversionsByCampaign,
      biddableByCampaign,
    );
    if (context.campaignType === "ecommerce") {
      stampAddToCart(records, addToCartByCampaignDay);
    }
    console.log(
      `[sync-google-ads] conversion goals: ${goalCount} campaigns, add-to-cart segments: ${addToCartByCampaignDay.size}`,
    );
  } catch (categoryErr) {
    // Non-fatal: the pulse falls back to the report type, add-to-cart shows as unavailable.
    console.warn(
      "[sync-google-ads] conversion category enrichment failed (non-fatal):",
      categoryErr instanceof Error
        ? categoryErr.message
        : JSON.stringify(categoryErr).slice(0, 300),
    );
  }
  await addUncountedCalls(records, context);
}

/** Set `conversion_goal` on every record whose campaign's goal is known; returns how many campaigns have one. */
function stampConversionGoals(
  records: ConversionEnrichedRecord[],
  conversionsByCampaign: Map<string, CampaignConversions>,
  biddableByCampaign: Map<string, string[]>,
): number {
  const goalByCampaign = new Map<string, GoogleCampaignGoal>();
  const campaignIds = new Set([
    ...conversionsByCampaign.keys(),
    ...biddableByCampaign.keys(),
  ]);
  for (const campaignId of campaignIds) {
    const goal = googleCampaignConversionGoal({
      biddableCategories: biddableByCampaign.get(campaignId) || [],
      ...(conversionsByCampaign.get(campaignId) || {}),
    });
    if (goal) {
      goalByCampaign.set(campaignId, goal);
    }
  }
  for (const rec of records) {
    const goal = goalByCampaign.get(rec.campaign_id);
    if (goal) {
      rec.conversion_goal = goal;
    }
  }
  return goalByCampaign.size;
}

/** Set `add_to_cart` on campaign-level records. */
function stampAddToCart(
  records: ConversionEnrichedRecord[],
  addToCartByCampaignDay: Map<string, number>,
) {
  // Only annotate when the account actually tracks add-to-cart; leaving the
  // field out keeps the report showing the column as unavailable.
  if (addToCartByCampaignDay.size === 0) {
    return;
  }
  for (const rec of records) {
    if ((rec.entity_level || "campaign") !== "campaign") {
      continue;
    }
    rec.add_to_cart =
      addToCartByCampaignDay.get(`${rec.campaign_id}|${rec.date}`) || 0;
  }
}

/**
 * Add the calls Google left out of `conversions` to campaign-level records of
 * campaigns that are not sales campaigns: a call is a lead, not a purchase. The
 * call read is per campaign, so ad group and ad rows keep Google's own
 * conversions. A failed read is logged and leaves conversions as Google has
 * them.
 */
async function addUncountedCalls(
  records: Array<ConversionEnrichedRecord>,
  context: ConversionEnrichmentContext,
) {
  let callsByCampaignDay: Map<string, number>;
  try {
    callsByCampaignDay = await fetchUncountedCallsByCampaignDay(
      context.runGaqlSearch,
      context.startIso,
      context.endIso,
    );
  } catch (callErr) {
    console.warn(
      "[sync-google-ads] call leads read failed (non-fatal):",
      callErr instanceof Error
        ? callErr.message
        : JSON.stringify(callErr).slice(0, 300),
    );
    return;
  }
  for (const rec of records) {
    const calls = callsByCampaignDay.get(`${rec.campaign_id}|${rec.date}`);
    if (
      !calls ||
      (rec.entity_level || "campaign") !== "campaign" ||
      rec.conversion_goal === "ecommerce"
    ) {
      continue;
    }
    rec.conversions = (rec.conversions || 0) + calls;
    rec.added_call_leads = calls;
    if (rec.cost !== undefined) {
      rec.cost_per_conversion = rec.cost / rec.conversions;
    }
  }
  console.log(
    `[sync-google-ads] uncounted call segments: ${callsByCampaignDay.size}`,
  );
}
