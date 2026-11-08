import { Card, CardContent } from "@/components/ui/card";
import type { RatioFigures } from "./siteKpis";

type Props = {
  /** Purchase revenue for the period, net of refunds; the card hides at zero. */
  revenue: number;
  /** The conversion pair's figures; the card hides without a pair. */
  ratio: RatioFigures | null;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
};

/** Purchase revenue and the chosen step-to-step conversion, above the event cards. */
export function SiteKpiCards({
  revenue,
  ratio,
  formatCurrency,
  formatNumber,
}: Props) {
  if (revenue === 0 && !ratio) {
    return null;
  }
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
      {revenue !== 0 && (
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">הכנסות מרכישות</p>
            <p className="text-3xl font-bold mt-2">{formatCurrency(revenue)}</p>
          </CardContent>
        </Card>
      )}
      {ratio && (
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              יחס המרה: {ratio.label}
            </p>
            <p className="text-3xl font-bold mt-2">
              {ratio.rate === null ? "—" : `${(ratio.rate * 100).toFixed(1)}%`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {`${formatNumber(ratio.done)} מתוך ${formatNumber(ratio.of)} ${
                ratio.basis === "people" ? "משתמשים" : "אירועים"
              }`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
