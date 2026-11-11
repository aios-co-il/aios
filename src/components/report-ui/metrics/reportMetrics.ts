import {
  formatCurrency,
  formatUnitCost,
  type CurrencyCode,
} from "@/lib/currency";
import type { KpiDelta } from "../ReportKpiCard";
import { DELIVERY_METRICS } from "./deliveryMetrics";
import type { ReportFigures } from "./reportFigures";
import type {
  ReportMetric,
  ReportMetricFormat,
  ReportMetricKey,
} from "./reportMetricTypes";
import { SALES_METRICS } from "./salesMetrics";

/**
 * The metric catalog: the one place a report metric is defined. Adding a
 * metric is a key in REPORT_METRIC_KEYS and an entry here; showing it is a
 * key in a layout widget.
 */
export const REPORT_METRICS: Record<ReportMetricKey, ReportMetric> = {
  ...DELIVERY_METRICS,
  ...SALES_METRICS,
};

/** A metric's value for display: the value, or a dash with the reason. */
export type ReportMetricReading = {
  metric: ReportMetric;
  value: number | null;
  /** The formatted value, or "—" when it cannot be measured. */
  text: string;
  /** Why there is a dash, or where the value comes from. */
  hint: string | null;
};

/**
 * Whether the figures have the metric's source; a block leaves the metric
 * out when they do not.
 */
export function isMetricAvailable(
  key: ReportMetricKey,
  figures: ReportFigures,
): boolean {
  const available = REPORT_METRICS[key].available;
  return available ? available(figures) : true;
}

/** The metric read from the figures and written in the currency. */
export function readMetric(
  key: ReportMetricKey,
  figures: ReportFigures,
  currency: CurrencyCode,
): ReportMetricReading {
  const metric = REPORT_METRICS[key];
  const value = metric.compute(figures);
  if (value === null) {
    return {
      metric,
      value,
      text: "—",
      hint: metric.whyEmpty?.(figures) ?? null,
    };
  }
  return {
    metric,
    value,
    text: formatMetricValue(metric.format, value, currency),
    hint: metric.source?.(figures) ?? null,
  };
}

/**
 * The change against the previous period, with the metric's good direction;
 * none when either period cannot measure it, the previous one is 0, or the
 * periods take it from different sources (Analytics then, the platforms now).
 */
export function metricDelta(
  key: ReportMetricKey,
  current: ReportFigures,
  previous: ReportFigures | null,
): KpiDelta | undefined {
  if (!previous) {
    return undefined;
  }
  const metric = REPORT_METRICS[key];
  const now = metric.compute(current);
  const before = metric.compute(previous);
  if (now === null || before === null || before === 0) {
    return undefined;
  }
  if (metric.source && metric.source(current) !== metric.source(previous)) {
    return undefined;
  }
  return { value: now / before - 1, goodWhen: metric.goodWhen };
}

/** A value written per its format; currency as the dashboard's (display only). */
export function formatMetricValue(
  format: ReportMetricFormat,
  value: number,
  currency: CurrencyCode,
): string {
  switch (format) {
    case "currency":
      return formatCurrency(value, currency);
    case "unitCost":
      return formatUnitCost(value, currency);
    case "ratio":
      return value.toFixed(2);
    case "percent":
      return `${(value * 100).toFixed(2)}%`;
    case "number":
      return Math.round(value).toLocaleString("he-IL");
  }
}
