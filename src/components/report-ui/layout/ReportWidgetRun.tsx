import { cn } from "@/lib/utils";
import { CarmenInsight } from "../CarmenInsight";
import { GoalCampaignTable } from "../blocks/GoalCampaignTable";
import { MetricChannelBreakdown } from "../blocks/MetricChannelBreakdown";
import { MetricKpiGrid } from "../blocks/MetricKpiGrid";
import { MetricTrendChart } from "../blocks/MetricTrendChart";
import type { ReportData, ReportScopeData } from "../data/reportData";
import type { ReportScope } from "../metrics/reportMetricTypes";
import type { CurrencyCode } from "@/lib/currency";
import { chartMetrics } from "./chartWidget";
import type { ReportWidget } from "./reportLayout";

interface ReportWidgetRunProps {
  run: Array<ReportWidget>;
  scopeName: ReportScope;
  scope: ReportScopeData;
  data: ReportData;
}

/**
 * One run of widgets. Chart cards share a row: a channel split takes a third
 * beside a trend, and two trends split the row evenly.
 */
export function ReportWidgetRun({
  run,
  scopeName,
  scope,
  data,
}: ReportWidgetRunProps) {
  if (
    run.length === 1 &&
    run[0].kind !== "channels" &&
    run[0].kind !== "trend"
  ) {
    return (
      <WidgetBlock
        widget={run[0]}
        scopeName={scopeName}
        scope={scope}
        data={data}
      />
    );
  }
  const hasChannels = run.some((widget) => widget.kind === "channels");
  return (
    <div
      className={cn(
        "grid gap-3",
        hasChannels ? "lg:grid-cols-3" : run.length > 1 && "lg:grid-cols-2",
      )}
    >
      {run.map((widget) => (
        <div
          key={widget.id}
          // Cards in one row share its height.
          className={cn(
            "[&>section]:h-full",
            hasChannels && widget.kind === "trend" && "lg:col-span-2",
          )}
        >
          <WidgetBlock
            widget={widget}
            scopeName={scopeName}
            scope={scope}
            data={data}
          />
        </div>
      ))}
    </div>
  );
}

/** One widget with its scope's data. */
function WidgetBlock({
  widget,
  scopeName,
  scope,
  data,
}: {
  widget: ReportWidget;
  scopeName: ReportScope;
  scope: ReportScopeData;
  data: ReportData;
}) {
  const { currency } = data;
  switch (widget.kind) {
    case "kpis":
      return (
        <MetricKpiGrid
          metrics={widget.metrics}
          current={scope.figures}
          previous={scope.previous}
          currency={currency}
        />
      );
    case "channels":
    case "trend":
      return <ChartBlock widget={widget} scope={scope} currency={currency} />;
    case "campaigns":
      // A campaign table belongs to a goal; "all" has none.
      return scopeName === "all" ? null : (
        <GoalCampaignTable
          goal={scopeName}
          scope={scope}
          metrics={widget.metrics}
          currency={currency}
        />
      );
    case "insight":
      return <CarmenInsight data={data} />;
  }
}

/** A channel or trend card with its metrics after the fallback. */
function ChartBlock({
  widget,
  scope,
  currency,
}: {
  widget: Extract<ReportWidget, { kind: "channels" | "trend" }>;
  scope: ReportScopeData;
  currency: CurrencyCode;
}) {
  const metrics = chartMetrics(widget, scope);
  if (!metrics) {
    return null;
  }
  return widget.kind === "channels" ? (
    <MetricChannelBreakdown
      scope={scope}
      metric={metrics.metric}
      detail={metrics.second}
      currency={currency}
    />
  ) : (
    <MetricTrendChart
      scope={scope}
      metric={metrics.metric}
      compare={metrics.second}
      currency={currency}
    />
  );
}
