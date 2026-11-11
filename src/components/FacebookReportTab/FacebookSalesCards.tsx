import {
  Banknote,
  ShoppingBag,
  ShoppingCart,
  Tag,
  TrendingUp,
} from "lucide-react";
import { ReportKpiCard } from "@/components/report-ui/ReportKpiCard";
import { kpiChange } from "@/components/report-ui/kpiChange";
import { ratio } from "@/lib/reportNumber";
import type { FacebookTabFormatters } from "./facebookColumns";
import { costPer, type FacebookTabTotals } from "./facebookTabFigures";

/** Purchases, purchase value, ROAS and add-to-cart of the sales campaigns, as Facebook reports them. */
export function FacebookSalesCards({
  sales,
  before,
  formatCurrency,
  formatNumber,
}: Pick<FacebookTabFormatters, "formatCurrency" | "formatNumber"> & {
  sales: FacebookTabTotals;
  /** The sales campaigns' previous period; null while the comparison is off. */
  before: FacebookTabTotals | null;
}) {
  const valued = sales.purchase_value > 0;
  return (
    <>
      <ReportKpiCard
        icon={ShoppingBag}
        label="רכישות"
        value={formatNumber(sales.purchases)}
        hint="לפי דיווח Facebook"
        delta={kpiChange(sales.purchases, before?.purchases, "up")}
      />
      {valued ? (
        <>
          <ReportKpiCard
            icon={Banknote}
            label="ערך רכישות"
            value={formatCurrency(sales.purchase_value)}
            hint="לפי דיווח Facebook"
            delta={kpiChange(
              sales.purchase_value,
              before?.purchase_value,
              "up",
            )}
          />
          <ReportKpiCard
            icon={TrendingUp}
            label="ROAS"
            value={`${ratio(sales.purchase_value, sales.spend).toFixed(2)}x`}
            delta={kpiChange(
              ratio(sales.purchase_value, sales.spend),
              before && ratio(before.purchase_value, before.spend),
              "up",
            )}
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
          delta={kpiChange(
            costPer(sales.spend, sales.purchases),
            before && costPer(before.spend, before.purchases),
            "down",
          )}
        />
      )}
      <ReportKpiCard
        icon={ShoppingCart}
        label="הוספות לעגלה"
        value={formatNumber(sales.add_to_cart)}
        delta={kpiChange(sales.add_to_cart, before?.add_to_cart, "up")}
      />
    </>
  );
}
