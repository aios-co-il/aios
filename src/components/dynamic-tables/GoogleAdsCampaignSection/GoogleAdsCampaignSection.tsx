import type { ReactNode } from "react";
import type { WooGoogleAttributionSummary } from "@/lib/wooAttribution";
import { GoogleAdsCampaignTable } from "./GoogleAdsCampaignTable";
import { GoogleAdsKpiCards } from "./GoogleAdsKpiCards";
import { GoogleWooNotice } from "./GoogleWooNotice";
import { googleStoreTotals } from "./googleAdsTotals";
import type { GoogleAdsCampaignSummary, GoogleAdsFormatters } from "./types";

type Props = GoogleAdsFormatters & {
  summary: GoogleAdsCampaignSummary;
  icon: ReactNode;
  /** WooCommerce attribution replaces the ecommerce purchases/revenue totals. */
  woo?: WooGoogleAttributionSummary | null;
};

/**
 * Google Ads tab of a client dashboard. Each campaign is shown by its own goal:
 * ecommerce campaigns with purchases, revenue and ROAS, lead campaigns with
 * conversions and cost per conversion, and campaigns set to pay for exposure
 * with spend, impressions and clicks only. Mixed accounts get one table per goal.
 */
export function GoogleAdsCampaignSection({
  summary,
  icon,
  woo,
  ...formats
}: Props) {
  const store = googleStoreTotals(summary.ecommerce, woo);
  const mixed =
    [summary.hasEcommerce, summary.hasLeads, summary.hasTraffic].filter(Boolean)
      .length > 1;
  const ecommerceRows = summary.campaigns.filter((c) => c.goal === "ecommerce");
  const leadRows = summary.campaigns.filter((c) => c.goal === "leads");
  const trafficRows = summary.campaigns.filter((c) => c.goal === "traffic");
  const tableProps = { store, storeFromWoo: !!woo, mixed, icon, ...formats };

  return (
    <div className="space-y-4">
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
      {trafficRows.length > 0 && (
        <GoogleAdsCampaignTable
          rows={trafficRows}
          goal="traffic"
          groupTotals={summary.traffic}
          {...tableProps}
        />
      )}

      {summary.campaigns.length === 0 && (
        <div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground shadow-elevation-1">
          אין נתוני Google Ads בטווח התאריכים הנבחר
        </div>
      )}
      {woo && (
        <p className="text-xs text-muted-foreground px-1">
          * שורת הסה"כ וכרטיסי הרכישות/הכנסות/ROAS מבוססים על ייחוס WooCommerce
          (Google ממומן). עמודות לפי קמפיין מציגות את דיווח Google Ads API.
        </p>
      )}
    </div>
  );
}
