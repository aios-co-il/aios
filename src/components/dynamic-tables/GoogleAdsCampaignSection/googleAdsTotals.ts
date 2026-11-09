import type { WooGoogleAttributionSummary } from "@/lib/wooAttribution";
import type { GoogleAdsTotals, GoogleStoreTotals } from "./types";

/** Zeroed metric totals. */
export function emptyTotals(): GoogleAdsTotals {
  return {
    impressions: 0,
    clicks: 0,
    spend: 0,
    conversions: 0,
    conversions_value: 0,
    leads: 0,
  };
}

/** Add one campaign's metrics into a running total. */
export function addTotals(target: GoogleAdsTotals, row: GoogleAdsTotals) {
  target.impressions += row.impressions;
  target.clicks += row.clicks;
  target.spend += row.spend;
  target.conversions += row.conversions;
  target.conversions_value += row.conversions_value;
  target.leads = (target.leads ?? 0) + (row.leads ?? 0);
}

/** Purchases, revenue and ROAS of the ecommerce campaigns; WooCommerce figures replace Google's when it overlays. */
export function googleStoreTotals(
  ecommerce: GoogleAdsTotals,
  woo?: WooGoogleAttributionSummary | null,
): GoogleStoreTotals {
  const purchases = woo ? woo.paidOrders : ecommerce.conversions;
  const revenue = woo ? woo.paidRevenue : ecommerce.conversions_value;
  return {
    purchases,
    revenue,
    roas: ecommerce.spend > 0 ? revenue / ecommerce.spend : 0,
    wooDiffers:
      !!woo &&
      (purchases !== ecommerce.conversions ||
        Math.abs(revenue - ecommerce.conversions_value) > 1),
  };
}
