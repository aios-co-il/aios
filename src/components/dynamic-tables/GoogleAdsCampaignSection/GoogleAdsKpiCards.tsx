import { KpiCard } from "./KpiCard";
import type {
  GoogleAdsCampaignSummary,
  GoogleAdsFormatters,
  GoogleStoreTotals,
} from "./types";

type Props = Pick<GoogleAdsFormatters, "formatCurrency" | "formatNumber"> & {
  summary: GoogleAdsCampaignSummary;
  store: GoogleStoreTotals;
  hasWoo: boolean;
};

/** Spend, impressions and clicks, then sales cards for ecommerce campaigns and lead cards for lead campaigns. */
export function GoogleAdsKpiCards({
  summary,
  store,
  hasWoo,
  formatCurrency,
  formatNumber,
}: Props) {
  const { totals, ecommerce, leads, hasEcommerce, hasLeads } = summary;
  const mixed = hasEcommerce && hasLeads;
  return (
    <div
      className={`grid gap-3 grid-cols-2 md:grid-cols-3 ${mixed ? "lg:grid-cols-4" : "lg:grid-cols-5"} auto-rows-fr`}
    >
      <KpiCard
        tone="from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900"
        label="הוצאה כוללת"
        value={formatCurrency(totals.spend)}
      />
      <KpiCard
        tone="from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900"
        label="חשיפות"
        value={formatNumber(totals.impressions)}
      />
      <KpiCard
        tone="from-cyan-50 to-cyan-100 dark:from-cyan-950 dark:to-cyan-900"
        label="קליקים"
        value={formatNumber(totals.clicks)}
      />
      {hasEcommerce && (
        <>
          <KpiCard
            tone="from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900"
            label={hasWoo ? "רכישות (WooCommerce)" : "רכישות"}
            value={formatNumber(store.purchases)}
            note={
              store.wooDiffers
                ? `Google Ads: ${formatNumber(ecommerce.conversions)}`
                : mixed
                  ? "קמפייני מכירות"
                  : null
            }
          />
          <KpiCard
            tone="from-green-50 to-green-100 dark:from-green-950 dark:to-green-900"
            label={hasWoo ? "הכנסות (WooCommerce)" : "הכנסות"}
            value={formatCurrency(store.revenue)}
            note={
              store.wooDiffers
                ? `Google Ads: ${formatCurrency(ecommerce.conversions_value)}`
                : null
            }
          />
          <KpiCard
            tone="from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900"
            label={hasWoo ? "ROAS (WooCommerce)" : "ROAS"}
            value={ecommerce.spend > 0 ? store.roas.toFixed(2) : "-"}
          />
        </>
      )}
      {hasLeads && (
        <>
          <KpiCard
            tone="from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900"
            label="המרות"
            value={formatNumber(leads.conversions)}
            note={mixed ? "קמפייני לידים" : null}
          />
          <KpiCard
            tone="from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900"
            label="עלות להמרה"
            value={
              leads.conversions > 0
                ? formatCurrency(leads.spend / leads.conversions)
                : "-"
            }
          />
        </>
      )}
    </div>
  );
}
