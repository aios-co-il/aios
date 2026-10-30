import type { WooGoogleAttributionSummary } from "@/lib/wooAttribution";
import type { GoogleAdsFormatters, GoogleAdsTotals } from "./types";

type Props = Pick<GoogleAdsFormatters, "formatCurrency" | "formatNumber"> & {
  ecommerce: GoogleAdsTotals;
  woo: WooGoogleAttributionSummary;
};

/** Says the purchase and revenue cards come from WooCommerce, and what Google Ads reported. */
export function GoogleWooNotice({
  ecommerce,
  woo,
  formatCurrency,
  formatNumber,
}: Props) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      רכישות והכנסות בכרטיסים למטה מבוססים על ייחוס WooCommerce (Google ממומן).
      דיווח Google Ads: {formatNumber(ecommerce.conversions)} המרות,{" "}
      {formatCurrency(ecommerce.conversions_value)} ערך המרה.
      {woo.organicOrders > 0 && (
        <>
          {" "}
          בנוסף: {formatNumber(woo.organicOrders)} רכישות Google אורגני (
          {formatCurrency(woo.organicRevenue)}).
        </>
      )}
    </div>
  );
}
