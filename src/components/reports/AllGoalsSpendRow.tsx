import { formatReportNumber } from "@/lib/reportNumber";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  currency: string;
  spend: number;
  /** Horizontal padding that lines the row up with the tables above it. */
  className?: string;
};

/**
 * The spend of every goal together, under a report's per-goal tables. Results
 * are never added across goals, so spend is the only shared total.
 */
export function AllGoalsSpendRow({ label, currency, spend, className }: Props) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-t bg-muted/40 py-2 text-sm font-semibold",
        className,
      )}
      dir="rtl"
    >
      <span>{label}</span>
      <span>
        {currency}
        {formatReportNumber(spend)}
      </span>
    </div>
  );
}
