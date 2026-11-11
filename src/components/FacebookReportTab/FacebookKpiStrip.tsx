import {
  Banknote,
  Eye,
  MousePointerClick,
  Percent,
  ShoppingBag,
  ShoppingCart,
  Tag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { ReportKpiCard } from "@/components/report-ui/ReportKpiCard";
import { ratio } from "@/lib/reportNumber";
import type { FacebookTabFormatters } from "./facebookColumns";
import type { FacebookTabTotals } from "./facebookTabFigures";

type Props = FacebookTabFormatters & {
  totals: FacebookTabTotals;
  /** The goal tables the tab shows; each adds its result cards. */
  goals: { sales: FacebookTabTotals | null; leads: FacebookTabTotals | null };
};

/**
 * The tab's headline figures: spend and delivery over every campaign, then
 * the leads cards when there are lead campaigns and the sales cards when
 * there are sales campaigns, each over that goal's campaigns as in its table.
 */
export function FacebookKpiStrip({
  totals,
  goals,
  formatCurrency,
  formatNumber,
  formatUnitCost,
}: Props) {
  const { sales, leads } = goals;
  return (
    <div className="grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
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
      <ReportKpiCard
        icon={Percent}
        label="CTR"
        value={`${(ratio(totals.clicks, totals.impressions) * 100).toFixed(2)}%`}
      />
      <ReportKpiCard
        icon={Tag}
        label="עלות לקליק"
        value={formatUnitCost(ratio(totals.spend, totals.clicks))}
      />
      {leads && (
        <>
          <ReportKpiCard
            icon={Users}
            label="לידים"
            value={formatNumber(leads.leads)}
            hint="קמפייני לידים"
          />
          <ReportKpiCard
            icon={Tag}
            label="עלות לליד"
            value={
              leads.leads > 0 ? formatCurrency(leads.spend / leads.leads) : "-"
            }
          />
        </>
      )}
      {sales && (
        <SalesCards sales={sales} {...{ formatCurrency, formatNumber }} />
      )}
    </div>
  );
}

/** Purchases, purchase value, ROAS and add-to-cart of the sales campaigns, as Facebook reports them. */
function SalesCards({
  sales,
  formatCurrency,
  formatNumber,
}: Pick<FacebookTabFormatters, "formatCurrency" | "formatNumber"> & {
  sales: FacebookTabTotals;
}) {
  const valued = sales.purchase_value > 0;
  return (
    <>
      <ReportKpiCard
        icon={ShoppingBag}
        label="רכישות"
        value={formatNumber(sales.purchases)}
        hint="לפי דיווח Facebook"
      />
      {valued ? (
        <>
          <ReportKpiCard
            icon={Banknote}
            label="ערך רכישות"
            value={formatCurrency(sales.purchase_value)}
            hint="לפי דיווח Facebook"
          />
          <ReportKpiCard
            icon={TrendingUp}
            label="ROAS"
            value={`${ratio(sales.purchase_value, sales.spend).toFixed(2)}x`}
          />
        </>
      ) : (
        <ReportKpiCard
          icon={Tag}
          label="עלות לרכישה"
          value={
            sales.purchases > 0 && sales.spend > 0
              ? formatCurrency(sales.spend / sales.purchases)
              : "-"
          }
        />
      )}
      <ReportKpiCard
        icon={ShoppingCart}
        label="הוספות לעגלה"
        value={formatNumber(sales.add_to_cart)}
      />
    </>
  );
}
