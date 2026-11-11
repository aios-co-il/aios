import type { CurrencyCode } from "@/lib/currency";
import { CampaignStatusSwitch } from "../CampaignStatusSwitch";
import type { ReportCampaignRow } from "../data/reportData";
import type { ReportFigures } from "../metrics/reportFigures";
import { isMetricAvailable, readMetric } from "../metrics/reportMetrics";
import type { ReportMetricKey } from "../metrics/reportMetricTypes";
import { sumFigures, type ChannelGroup } from "./groupRowsByChannel";
import { REPORT_CHANNEL_LABELS } from "./reportChannels";

export const CELL = "px-2 py-2.5 text-start tabular-nums whitespace-nowrap";

interface GoalCampaignChannelRowsProps {
  group: ChannelGroup<ReportCampaignRow>;
  /** Show the platform's title and subtotal; off when it is the only one. */
  labelled: boolean;
  metrics: Array<ReportMetricKey>;
  currency: CurrencyCode;
}

/** One platform's campaigns in a goal table, under its name, with a subtotal. */
export function GoalCampaignChannelRows({
  group,
  labelled,
  metrics,
  currency,
}: GoalCampaignChannelRowsProps) {
  const label = REPORT_CHANNEL_LABELS[group.channel];
  return (
    <>
      {labelled && (
        <tr className="border-b bg-muted/40">
          <td colSpan={metrics.length + 1} className="px-2 py-1.5">
            <span className="flex items-center gap-2 text-xs font-semibold">
              {label.mark}
              {label.name}
            </span>
          </td>
        </tr>
      )}
      {group.rows.map((row) => (
        <tr key={row.key} className="border-b last:border-0">
          <td className="max-w-[18rem] px-2 py-2.5">
            <span className="flex items-center gap-2">
              {/* The platform's on/off state, at the start of the row. */}
              <CampaignStatusSwitch on={row.on} compact />
              <span className="truncate" title={row.name}>
                {row.name}
              </span>
            </span>
          </td>
          <MetricCells
            metrics={metrics}
            figures={row.figures}
            currency={currency}
          />
        </tr>
      ))}
      {labelled && (
        <tr className="border-b font-medium text-muted-foreground">
          <td className="px-2 py-2.5">סה״כ {label.name}</td>
          <MetricCells
            metrics={metrics}
            figures={sumFigures(group.rows)}
            currency={currency}
          />
        </tr>
      )}
    </>
  );
}

/** A cell per metric; a dash where the row cannot measure it. */
export function MetricCells({
  metrics,
  figures,
  currency,
}: {
  metrics: Array<ReportMetricKey>;
  figures: ReportFigures;
  currency: CurrencyCode;
}) {
  return metrics.map((key) => (
    <td key={key} className={CELL}>
      {isMetricAvailable(key, figures)
        ? readMetric(key, figures, currency).text
        : "—"}
    </td>
  ));
}
