import { cn } from "@/lib/utils";
import type { CurrencyCode } from "@/lib/currency";
import type { ReportFigures } from "../metrics/reportFigures";
import { readMetric, REPORT_METRICS } from "../metrics/reportMetrics";
import type { ReportMetricKey } from "../metrics/reportMetricTypes";

/**
 * The previous period's value under a table cell, with an arrow for the way
 * it moved: green when the change is good news, red when it is not, grey
 * for spend and other neutral figures. A dash when the row did not run then.
 */
export function PreviousMetricLine({
  metric,
  current,
  previous,
  currency,
}: {
  metric: ReportMetricKey;
  current: ReportFigures;
  /** Null when the row has no previous period. */
  previous: ReportFigures | null;
  currency: CurrencyCode;
}) {
  const before = previous ? readMetric(metric, previous, currency) : null;
  if (!before || before.value === null) {
    return (
      <span
        className="block text-xs text-muted-foreground"
        title="לא נמדד בתקופה הקודמת"
      >
        —
      </span>
    );
  }
  const now = REPORT_METRICS[metric].compute(current);
  const moved = now === null ? 0 : Math.sign(now - before.value);
  const goodWhen = REPORT_METRICS[metric].goodWhen;
  const good =
    goodWhen === "either" || moved === 0
      ? null
      : moved > 0 === (goodWhen === "up");
  return (
    <span
      className={cn(
        "block text-xs",
        good === null && "text-muted-foreground",
        good === true && "text-brand-accent-700 dark:text-brand-accent-400",
        good === false && "text-destructive",
      )}
      title="תקופה קודמת"
    >
      {moved !== 0 && <span aria-hidden="true">{moved > 0 ? "▲ " : "▼ "}</span>}
      {before.text}
    </span>
  );
}
