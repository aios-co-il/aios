// Decide whether a Google Ads campaign is an ecommerce or a lead campaign from
// what it is set to convert on. Performance Max and Search campaigns carry no
// objective, so this is the only reliable per-campaign signal Google gives.

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

export function conversionCategorySide(category) {
  const value = String(category || "").toUpperCase();
  if (PURCHASE_CATEGORIES.has(value)) return "ecommerce";
  if (LEAD_CATEGORIES.has(value)) return "leads";
  return null;
}

/**
 * @param {{ biddableCategories?: string[], purchaseConversions?: number, leadConversions?: number }} input
 *   biddableCategories: the conversion goals the campaign bids on (campaign_conversion_goal).
 *   purchase/leadConversions: primary conversions in the synced window, split by category.
 * @returns {"ecommerce" | "leads" | null}
 */
export function googleCampaignConversionGoal({
  biddableCategories = [],
  purchaseConversions = 0,
  leadConversions = 0,
} = {}) {
  const sides = new Set(
    biddableCategories.map(conversionCategorySide).filter(Boolean),
  );
  // What the campaign is set to bid on is stable even on days with no conversions.
  if (sides.size === 1) return [...sides][0];
  // Bidding on both (or on neither): let the conversions it actually got decide.
  if (purchaseConversions > leadConversions) return "ecommerce";
  if (leadConversions > purchaseConversions) return "leads";
  return null;
}
