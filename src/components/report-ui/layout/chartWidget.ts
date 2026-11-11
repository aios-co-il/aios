import type { ReportScopeData } from "../data/reportData";
import { REPORT_METRICS } from "../metrics/reportMetrics";
import type { ReportMetricKey } from "../metrics/reportMetricTypes";
import type { ReportWidget } from "./reportLayout";

/** The metrics a chart card draws once its fallback is applied. */
export type ChartMetrics = {
  metric: ReportMetricKey;
  /** The channel card's detail or the trend's second line. */
  second?: ReportMetricKey;
};

/**
 * A chart widget's metrics for its scope: its own, or its fallback when no
 * row of the chart can measure its metric (revenue of purchases without a
 * value). Null when neither can be measured, so the card is left out.
 */
export function chartMetrics(
  widget: Extract<ReportWidget, { kind: "channels" | "trend" }>,
  scope: ReportScopeData,
): ChartMetrics | null {
  const own: ChartMetrics = {
    metric: widget.metric,
    second: widget.kind === "channels" ? widget.detail : widget.compare,
  };
  if (measurable(own.metric, widget, scope)) {
    return own;
  }
  const fallback = fallbackMetrics(widget);
  return fallback && measurable(fallback.metric, widget, scope)
    ? fallback
    : null;
}

/** The widget's fallback metrics, or null without a fallback. */
function fallbackMetrics(
  widget: Extract<ReportWidget, { kind: "channels" | "trend" }>,
): ChartMetrics | null {
  if (!widget.fallback) {
    return null;
  }
  if (widget.kind === "channels") {
    return { metric: widget.fallback.metric, second: widget.fallback.detail };
  }
  return { metric: widget.fallback.metric, second: widget.fallback.compare };
}

/**
 * Whether any row the chart draws measures the metric above zero: a channel for a
 * channel split, a day for a trend. The scope's totals can differ (a store's
 * revenue where each channel's purchases carry no value).
 */
function measurable(
  key: ReportMetricKey,
  widget: Extract<ReportWidget, { kind: "channels" | "trend" }>,
  scope: ReportScopeData,
): boolean {
  const rows = widget.kind === "channels" ? scope.channels : scope.daily;
  // A zero, such as a day without purchases, says nothing about whether the
  // days with purchases carry a value, so it does not count.
  return rows.some(({ figures }) => {
    const value = REPORT_METRICS[key].compute(figures);
    return value !== null && value > 0;
  });
}
