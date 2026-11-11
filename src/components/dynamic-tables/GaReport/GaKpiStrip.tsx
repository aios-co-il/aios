import {
  CreditCard,
  Eye,
  MousePointerClick,
  ShoppingCart,
  Target,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import {
  ReportKpiCard,
  type KpiDelta,
} from "@/components/report-ui/ReportKpiCard";

/** The Analytics totals the strip reads. */
export type GaKpiTotals = {
  users: number;
  sessions: number;
  pageviews: number;
  conversions: number;
  addToCart: number;
  purchases: number;
  purchaseValue: number;
};

type Props = {
  totals: GaKpiTotals;
  /** The previous period's totals while the comparison is on. */
  previous: GaKpiTotals | null;
  reportMode: "ecommerce" | "leads";
  formatNumber: (value: number) => string;
  formatCurrency: (value: number) => string;
};

/**
 * The Analytics headline figures: users, sessions and page views, then the
 * store's add-to-cart, purchases and purchase value, or the conversions and
 * conversion rates of a lead site. Each count shows its change against the
 * previous period while the comparison is on.
 */
export function GaKpiStrip({
  totals,
  previous,
  reportMode,
  formatNumber,
  formatCurrency,
}: Props) {
  return (
    <div className="grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <ReportKpiCard
        icon={Users}
        label="משתמשים"
        value={formatNumber(totals.users)}
        delta={changeOf(totals, previous, "users")}
      />
      <ReportKpiCard
        icon={MousePointerClick}
        label="סשנים"
        value={formatNumber(totals.sessions)}
        delta={changeOf(totals, previous, "sessions")}
      />
      <ReportKpiCard
        icon={Eye}
        label="צפיות עמוד"
        value={formatNumber(totals.pageviews)}
        delta={changeOf(totals, previous, "pageviews")}
      />
      {reportMode === "ecommerce" ? (
        <>
          <ReportKpiCard
            icon={ShoppingCart}
            label="הוספה לעגלה"
            value={formatNumber(totals.addToCart)}
            delta={changeOf(totals, previous, "addToCart")}
          />
          <ReportKpiCard
            icon={CreditCard}
            label="רכישות"
            value={formatNumber(totals.purchases)}
            delta={changeOf(totals, previous, "purchases")}
          />
          <ReportKpiCard
            icon={TrendingUp}
            label="שווי רכישות"
            value={formatCurrency(totals.purchaseValue)}
            delta={changeOf(totals, previous, "purchaseValue")}
          />
        </>
      ) : (
        <>
          <ReportKpiCard
            icon={Target}
            label="המרות (לידים)"
            value={formatNumber(totals.conversions)}
            delta={changeOf(totals, previous, "conversions")}
          />
          <ReportKpiCard
            icon={TrendingUp}
            label="שיעור המרה"
            value={percentOf(totals.conversions, totals.sessions)}
          />
          <ReportKpiCard
            icon={UserCheck}
            label="המרות למשתמש"
            value={percentOf(totals.conversions, totals.users)}
          />
        </>
      )}
    </div>
  );
}

/** The change against the previous period; none without one or from zero. */
function changeOf(
  totals: GaKpiTotals,
  previous: GaKpiTotals | null,
  key: keyof GaKpiTotals,
): KpiDelta | undefined {
  const before = previous?.[key];
  if (!before) {
    return undefined;
  }
  return { value: (totals[key] - before) / before, goodWhen: "up" };
}

/** a ÷ b as a percentage with two decimals, "0%" without a base. */
function percentOf(part: number, base: number): string {
  return base > 0 ? `${((part / base) * 100).toFixed(2)}%` : "0%";
}
