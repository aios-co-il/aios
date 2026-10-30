import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import type { WooGoogleAttributionSummary } from "@/lib/wooAttribution";
import { GoogleAdsCampaignTable } from "./GoogleAdsCampaignTable";
import { GoogleAdsKpiCards } from "./GoogleAdsKpiCards";
import { GoogleWooNotice } from "./GoogleWooNotice";
import type {
  GoogleAdsCampaignSummary,
  GoogleAdsFormatters,
  GoogleAdsTotals,
  GoogleStoreTotals,
} from "./types";

type Props = GoogleAdsFormatters & {
  summary: GoogleAdsCampaignSummary;
  icon: ReactNode;
  /** WooCommerce attribution replaces the ecommerce purchases/revenue totals. */
  woo?: WooGoogleAttributionSummary | null;
};

/**
 * Google Ads tab of a client dashboard. Each campaign is shown by its own goal:
 * ecommerce campaigns with purchases, revenue and ROAS, lead campaigns with
 * conversions and cost per conversion. Mixed accounts get one table per goal.
 */
export function GoogleAdsCampaignSection({
  summary,
  icon,
  woo,
  ...formats
}: Props) {
  const store = googleStoreTotals(summary.ecommerce, woo);
  const mixed = summary.hasEcommerce && summary.hasLeads;
  const ecommerceRows = summary.campaigns.filter((c) => c.goal === "ecommerce");
  const leadRows = summary.campaigns.filter((c) => c.goal === "leads");
  const tableProps = { store, mixed, icon, ...formats };

  return (
    <>
      {woo && store.wooDiffers && (
        <GoogleWooNotice ecommerce={summary.ecommerce} woo={woo} {...formats} />
      )}
      <GoogleAdsKpiCards
        summary={summary}
        store={store}
        hasWoo={!!woo}
        {...formats}
      />

      {ecommerceRows.length > 0 && (
        <GoogleAdsCampaignTable
          rows={ecommerceRows}
          goal="ecommerce"
          groupTotals={summary.ecommerce}
          {...tableProps}
        />
      )}
      {leadRows.length > 0 && (
        <GoogleAdsCampaignTable
          rows={leadRows}
          goal="leads"
          groupTotals={summary.leads}
          {...tableProps}
        />
      )}

      {summary.campaigns.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            אין נתוני Google Ads בטווח התאריכים הנבחר
          </p>
        </Card>
      )}
      {woo && (
        <p className="text-xs text-muted-foreground px-1">
          * שורת הסה"כ וכרטיסי הרכישות/הכנסות/ROAS מבוססים על ייחוס WooCommerce
          (Google ממומן). עמודות לפי קמפיין מציגות את דיווח Google Ads API.
        </p>
      )}
    </>
  );
}

/** Purchases, revenue and ROAS of the ecommerce campaigns; WooCommerce figures replace Google's when it overlays. */
function googleStoreTotals(
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
