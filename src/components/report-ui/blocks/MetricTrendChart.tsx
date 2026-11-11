import { format, parseISO } from "date-fns";
import { LineChart } from "lucide-react";
import type { CurrencyCode } from "@/lib/currency";
import { ReportTrendChart } from "../ReportTrendChart";
import type { ReportScopeData } from "../data/reportData";
import {
  formatMetricValue,
  isMetricAvailable,
  REPORT_METRICS,
} from "../metrics/reportMetrics";
import type { ReportMetricKey } from "../metrics/reportMetricTypes";

interface MetricTrendChartProps {
  scope: ReportScopeData;
  metric: ReportMetricKey;
  compare?: ReportMetricKey;
  currency: CurrencyCode;
}

type TrendRow = { day: string; value: number | null; compare: number | null };

/**
 * One metric day by day, with an optional second line. Nothing when the
 * scope has no days or no source for the metric (sessions without Analytics).
 */
export function MetricTrendChart({
  scope,
  metric,
  compare,
  currency,
}: MetricTrendChartProps) {
  const main = REPORT_METRICS[metric];
  const second = compare ? REPORT_METRICS[compare] : null;
  const days = scope.daily.filter(({ figures }) =>
    isMetricAvailable(metric, figures),
  );
  if (days.length < 2) {
    return null;
  }
  const data: Array<TrendRow> = days.map(({ date, figures }) => ({
    day: format(parseISO(date), "dd/MM"),
    value: main.compute(figures),
    compare: second ? second.compute(figures) : null,
  }));
  return (
    <ReportTrendChart
      title={
        second
          ? `${main.label} מול ${second.label}`
          : `${main.label} לאורך התקופה`
      }
      icon={LineChart}
      data={data}
      xKey="day"
      valueKey="value"
      valueName={main.label}
      compare={second ? { key: "compare", name: second.label } : undefined}
      format={(value) => formatMetricValue(main.format, value, currency)}
      height={220}
    />
  );
}
