import {
  Banknote,
  Eye,
  MousePointerClick,
  ShoppingBag,
  Tag,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { ReportKpiCard } from "@/components/report-ui/ReportKpiCard";
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
      className={`grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-3 ${mixed ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}
    >
      <ReportKpiCard
        icon={Wallet}
        label="הוצאה כוללת"
        value={formatCurrency(totals.spend)}
      />
      <ReportKpiCard
        icon={Eye}
        label="חשיפות"
        value={formatNumber(totals.impressions)}
      />
      <ReportKpiCard
        icon={MousePointerClick}
        label="קליקים"
        value={formatNumber(totals.clicks)}
      />
      {hasEcommerce && (
        <>
          <ReportKpiCard
            icon={ShoppingBag}
            label={hasWoo ? "רכישות (WooCommerce)" : "רכישות"}
            value={formatNumber(store.purchases)}
            hint={purchasesHint(store, mixed, () =>
              formatNumber(ecommerce.conversions),
            )}
          />
          <ReportKpiCard
            icon={Banknote}
            label={hasWoo ? "הכנסות (WooCommerce)" : "הכנסות"}
            value={formatCurrency(store.revenue)}
            hint={
              store.wooDiffers
                ? `Google Ads: ${formatCurrency(ecommerce.conversions_value)}`
                : undefined
            }
          />
          <ReportKpiCard
            icon={TrendingUp}
            label={hasWoo ? "ROAS (WooCommerce)" : "ROAS"}
            value={ecommerce.spend > 0 ? store.roas.toFixed(2) : "-"}
          />
        </>
      )}
      {hasLeads && (
        <>
          <ReportKpiCard
            icon={Target}
            label="המרות"
            value={formatNumber(leads.conversions)}
            hint={mixed ? "קמפייני לידים" : undefined}
          />
          <ReportKpiCard
            icon={Tag}
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

/** What Google Ads reported when WooCommerce replaces it, or which campaigns a mixed account's card counts. */
function purchasesHint(
  store: GoogleStoreTotals,
  mixed: boolean,
  googleConversions: () => string,
): string | undefined {
  if (store.wooDiffers) {
    return `Google Ads: ${googleConversions()}`;
  }
  return mixed ? "קמפייני מכירות" : undefined;
}
