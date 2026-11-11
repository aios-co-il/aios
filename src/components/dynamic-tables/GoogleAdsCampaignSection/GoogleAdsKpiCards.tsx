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
import { kpiChange } from "@/components/report-ui/kpiChange";
import type {
  GoogleAdsCampaignSummary,
  GoogleAdsFormatters,
  GoogleStoreTotals,
} from "./types";

type Props = Pick<GoogleAdsFormatters, "formatCurrency" | "formatNumber"> & {
  summary: GoogleAdsCampaignSummary;
  store: GoogleStoreTotals;
  hasWoo: boolean;
  /**
   * The previous period, for each card's change. The store cards show none
   * while WooCommerce supplies them: its previous figures are not loaded here.
   */
  previous?: GoogleAdsCampaignSummary | null;
};

/** Spend, impressions and clicks, then sales cards for ecommerce campaigns and lead cards for lead campaigns. */
export function GoogleAdsKpiCards({
  summary,
  store,
  hasWoo,
  previous,
  formatCurrency,
  formatNumber,
}: Props) {
  const { totals, ecommerce, leads, hasEcommerce, hasLeads } = summary;
  const before = previous?.totals;
  const salesBefore = hasWoo ? undefined : previous?.ecommerce;
  const leadsBefore = previous?.leads;
  const mixed = hasEcommerce && hasLeads;
  return (
    <div
      className={`grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-3 ${mixed ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}
    >
      <ReportKpiCard
        icon={Wallet}
        label="הוצאה כוללת"
        value={formatCurrency(totals.spend)}
        delta={kpiChange(totals.spend, before?.spend, "either")}
      />
      <ReportKpiCard
        icon={Eye}
        label="חשיפות"
        value={formatNumber(totals.impressions)}
        delta={kpiChange(totals.impressions, before?.impressions, "up")}
      />
      <ReportKpiCard
        icon={MousePointerClick}
        label="קליקים"
        value={formatNumber(totals.clicks)}
        delta={kpiChange(totals.clicks, before?.clicks, "up")}
      />
      {hasEcommerce && (
        <>
          <ReportKpiCard
            icon={ShoppingBag}
            label={hasWoo ? "רכישות (WooCommerce)" : "רכישות"}
            value={formatNumber(store.purchases)}
            delta={kpiChange(store.purchases, salesBefore?.conversions, "up")}
            hint={purchasesHint(store, mixed, () =>
              formatNumber(ecommerce.conversions),
            )}
          />
          <ReportKpiCard
            icon={Banknote}
            label={hasWoo ? "הכנסות (WooCommerce)" : "הכנסות"}
            value={formatCurrency(store.revenue)}
            delta={kpiChange(
              store.revenue,
              salesBefore?.conversions_value,
              "up",
            )}
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
            delta={kpiChange(
              ecommerce.spend > 0 ? store.roas : null,
              salesBefore && salesBefore.spend > 0
                ? salesBefore.conversions_value / salesBefore.spend
                : null,
              "up",
            )}
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
            delta={kpiChange(leads.conversions, leadsBefore?.conversions, "up")}
          />
          <ReportKpiCard
            icon={Tag}
            label="עלות להמרה"
            value={
              leads.conversions > 0
                ? formatCurrency(leads.spend / leads.conversions)
                : "-"
            }
            delta={kpiChange(
              leads.conversions > 0 ? leads.spend / leads.conversions : null,
              leadsBefore && leadsBefore.conversions > 0
                ? leadsBefore.spend / leadsBefore.conversions
                : null,
              "down",
            )}
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
