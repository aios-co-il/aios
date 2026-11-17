import { Percent, Wallet } from "lucide-react";
import { ReportKpiCard } from "@/components/report-ui/ReportKpiCard";
import type { RatioFigures } from "./siteKpis";

type Props = {
  /** Purchase revenue for the period, net of refunds; the card hides at zero. */
  revenue: number;
  /** The conversion pair's figures; the card hides without a pair. */
  ratio: RatioFigures | null;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
};

/**
 * Purchase revenue and the chosen step-to-step conversion, as cards in the
 * goals grid ahead of the event cards.
 */
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
    <>
      {revenue !== 0 && (
        <ReportKpiCard
          icon={Wallet}
          label="הכנסות מרכישות"
          value={formatCurrency(revenue)}
        />
      )}
      {ratio && (
        <ReportKpiCard
          icon={Percent}
          label={`יחס המרה: ${ratio.label}`}
          value={
            ratio.rate === null ? "—" : `${(ratio.rate * 100).toFixed(1)}%`
          }
          hint={`${formatNumber(ratio.done)} מתוך ${formatNumber(ratio.of)} ${
            ratio.basis === "people" ? "משתמשים" : "אירועים"
          }`}
        />
      )}
    </>
  );
}
