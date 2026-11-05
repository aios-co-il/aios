import type { GoogleCampaignGoal } from "../_shared/pulse/google-campaign-goal.ts";

export type ConversionGoalInput = {
  /** The conversion goal categories the campaign bids on (campaign_conversion_goal). */
  biddableCategories?: string[];
  /** Primary purchase conversions in the synced window. */
  purchaseConversions?: number;
  /** Primary lead conversions in the synced window. */
  leadConversions?: number;
};

/**
 * Decide whether a Google Ads campaign is an ecommerce or a lead campaign from
 * what it is set to convert on. Performance Max and Search campaigns carry no
 * objective, so this is the only reliable per-campaign signal Google gives.
 */
export function googleCampaignConversionGoal({
  biddableCategories = [],
  purchaseConversions = 0,
  leadConversions = 0,
}: ConversionGoalInput = {}): GoogleCampaignGoal | null {
  const sides = new Set(
    biddableCategories
      .map((category) => conversionCategorySide(category))
      .filter((side): side is GoogleCampaignGoal => side !== null),
  );
  // What the campaign is set to bid on is stable even on days with no conversions.
  if (sides.size === 1) {
    return [...sides][0];
  }
  // Bidding on both (or on neither): let the conversions it actually got decide.
  if (purchaseConversions > leadConversions) {
    return "ecommerce";
  }
  if (leadConversions > purchaseConversions) {
    return "leads";
  }
  return null;
}

const PURCHASE_CATEGORIES = new Set([
  "PURCHASE",
  "STORE_SALE",
  "SUBSCRIBE_PAID",
]);
const LEAD_CATEGORIES = new Set([
  "SUBMIT_LEAD_FORM",
  "CONTACT",
  "PHONE_CALL_LEAD",
  "IMPORTED_LEAD",
  "QUALIFIED_LEAD",
  "CONVERTED_LEAD",
  "BOOK_APPOINTMENT",
  "REQUEST_QUOTE",
  "SIGNUP",
]);

/** The goal a Google conversion action category counts toward; null when it is neither a sale nor a lead. */
export function conversionCategorySide(
  category?: string,
): GoogleCampaignGoal | null {
  const value = (category ?? "").toUpperCase();
  if (PURCHASE_CATEGORIES.has(value)) {
    return "ecommerce";
  }
  if (LEAD_CATEGORIES.has(value)) {
    return "leads";
  }
  return null;
}
