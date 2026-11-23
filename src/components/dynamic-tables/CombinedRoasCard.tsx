import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  unvaluedPurchaseCost,
  type DashboardCombinedSales,
} from "@/lib/dashboardCombinedFigures";
import {
  formatSplitSalesMeasure,
  type GoalMoneyPart,
} from "@/lib/dashboardGoalMoney";

const TONES = {
  good: "from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900",
  bad: "from-red-50 to-red-100 dark:from-red-950 dark:to-red-900",
  none: "from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900",
};

/**
 * The "ROAS משולב" card of the internal and shared dashboards
 * (combinedDashboardSales). A dash, not a red 0.00, when no spend can be set
 * against the revenue. When the purchases carry no value it shows their cost
 * instead (unvaluedPurchaseCost). When the spend is in several currencies
 * (goalSalesMoney) it shows each currency's figure, or a dash when the
 * store's revenue is set against all of them.
 */
export function CombinedRoasCard({
  sales,
  formatCurrency,
  money = { split: null, unmeasurable: false },
}: {
  sales: DashboardCombinedSales;
  formatCurrency: (value: number) => string;
  money?: { split: Array<GoalMoneyPart> | null; unmeasurable: boolean };
}) {
  const purchaseCost = unvaluedPurchaseCost(sales);
  if (money.unmeasurable || money.split) {
    return <SplitRoasCard money={money} byPurchase={purchaseCost !== null} />;
  }
  if (purchaseCost !== null) {
    return (
      <Card className={`h-full bg-gradient-to-br ${TONES.none}`}>
        <CardContent className="p-6 flex flex-col items-center justify-center h-full text-center">
          <p className="text-sm text-muted-foreground">עלות לרכישה</p>
          <p className="text-3xl font-bold mt-2">
            {formatCurrency(purchaseCost)}
          </p>
        </CardContent>
      </Card>
    );
  }
  const { roas } = sales;
  const tone = roas === null ? "none" : roas >= 1 ? "good" : "bad";
  return (
    <Card className={`h-full bg-gradient-to-br ${TONES[tone]}`}>
      <CardContent className="p-6 flex flex-col items-center justify-center h-full text-center">
        <p className="text-sm text-muted-foreground">ROAS משולב</p>
        <div className="flex items-center gap-2 mt-2">
          <p className="text-3xl font-bold">
            {roas === null ? "-" : roas.toFixed(2)}
          </p>
          {roas !== null && roas > 1 ? (
            <TrendingUp className="h-6 w-6 text-green-600" />
          ) : roas !== null && roas < 1 ? (
            <TrendingDown className="h-6 w-6 text-red-600" />
          ) : (
            <Minus className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** The card of spend in several currencies, with each currency's figure. */
function SplitRoasCard({
  money,
  byPurchase,
}: {
  money: { split: Array<GoalMoneyPart> | null; unmeasurable: boolean };
  byPurchase: boolean;
}) {
  const label = byPurchase ? "עלות לרכישה" : "ROAS משולב";
  const value = formatSplitSalesMeasure(money, byPurchase);
  return (
    <Card className={`h-full bg-gradient-to-br ${TONES.none}`}>
      <CardContent className="p-6 flex flex-col items-center justify-center h-full text-center">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-2">{value}</p>
        {money.unmeasurable && (
          <p className="text-xs text-muted-foreground mt-1">
            ההוצאה במטבעות שונים
          </p>
        )}
      </CardContent>
    </Card>
  );
}
