import type { ReportData, ReportScopeData } from "../data/reportData";
import { isMetricAvailable } from "../metrics/reportMetrics";
import { chartMetrics } from "./chartWidget";
import type { ReportWidget } from "./reportLayout";

/**
 * Whether a widget has anything to show for its scope: KPIs with a metric
 * the scope has a source for, channels and campaigns with rows, charts whose
 * metric (or fallback) the scope can measure, a trend with at least two days
 * of it, and Carmen where the report offers her. The layout
 * view leaves the others out, so a stored layout never renders empty cards.
 */
export function isWidgetVisible(
  widget: ReportWidget,
  scope: ReportScopeData,
  data: Pick<ReportData, "askCarmen">,
): boolean {
  switch (widget.kind) {
    case "kpis":
      return widget.metrics.some((key) =>
        isMetricAvailable(key, scope.figures),
      );
    case "channels":
      return scope.channels.length > 0 && chartMetrics(widget, scope) !== null;
    case "trend":
      return trendVisible(widget, scope);
    case "campaigns":
      return scope.campaigns.length > 0;
    case "insight":
      return data.askCarmen;
  }
}

/**
 * The widgets in runs for layout: KPI rows, tables and Carmen each alone, and
 * chart cards in pairs (a channel split beside a trend, or two trends), so a
 * third chart gets a row of its own instead of a gap beside it.
 */
export function widgetRuns(
  widgets: Array<ReportWidget>,
): Array<Array<ReportWidget>> {
  const runs: Array<Array<ReportWidget>> = [];
  for (const widget of widgets) {
    const last = runs.at(-1);
    if (last && last.length < 2 && isChart(widget) && isChart(last[0])) {
      last.push(widget);
    } else {
      runs.push([widget]);
    }
  }
  return runs;
}

/** Whether a trend has a measurable metric and two days with its source. */
function trendVisible(
  widget: Extract<ReportWidget, { kind: "trend" }>,
  scope: ReportScopeData,
): boolean {
  const metrics = chartMetrics(widget, scope);
  if (!metrics) {
    return false;
  }
  const days = scope.daily.filter(({ figures }) =>
    isMetricAvailable(metrics.metric, figures),
  );
  return days.length >= 2;
}

/** Whether the widget is a chart card that shares a row. */
function isChart(widget: ReportWidget): boolean {
  return widget.kind === "channels" || widget.kind === "trend";
}
