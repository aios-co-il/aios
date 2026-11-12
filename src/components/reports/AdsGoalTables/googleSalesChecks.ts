import type { GoogleReportTotals } from "./googleGoalReport";

/** What the notes above a Google Ads report's tables say about its sales figures. */
export type GoogleSalesChecks = {
  /** Conversion value per conversion so low it points at the tracking setup. */
  suspiciousLowValue: boolean;
  /** All conversions carry much more value than the primary ones. */
  allValueHigher: boolean;
  avgValuePerConv: number;
};

/**
 * Checks a sales report's Google Ads conversion values. An absurdly low
 * average (e.g. ₪7 over 13 conversions) is almost always a tracking or
 * account setup issue, not a sync math bug. WooCommerce totals skip the check.
 */
export function googleSalesChecks(input: {
  totals: GoogleReportTotals;
  isEcommerce: boolean;
  /** WooCommerce's paid orders and revenue, when they replace the totals. */
  woo: { conversions: number; revenue: number } | null;
}): GoogleSalesChecks {
  const { totals, isEcommerce, woo } = input;
  const conversions = woo ? woo.conversions : totals.conversions;
  const revenue = woo ? woo.revenue : totals.conversions_value;
  const avgValuePerConv = conversions > 0 ? revenue / conversions : 0;
  return {
    avgValuePerConv,
    suspiciousLowValue:
      !woo &&
      isEcommerce &&
      totals.conversions >= 3 &&
      totals.conversions_value > 0 &&
      avgValuePerConv < 20,
    allValueHigher:
      isEcommerce &&
      totals.all_conversions_value > totals.conversions_value * 2 &&
      totals.all_conversions_value - totals.conversions_value > 50,
  };
}
