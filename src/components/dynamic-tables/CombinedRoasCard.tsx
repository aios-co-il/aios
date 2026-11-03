import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const TONES = {
  good: "from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900",
  bad: "from-red-50 to-red-100 dark:from-red-950 dark:to-red-900",
  none: "from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900",
};

/**
 * The "ROAS משולב" card of the internal and shared dashboards
 * (combinedDashboardSales). A dash, not a red 0.00, when no spend can be set
 * against the revenue.
 */
export function CombinedRoasCard({ roas }: { roas: number | null }) {
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
