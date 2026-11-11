import { Fragment } from "react";
import { PreviousValueCell } from "@/components/reports/PreviousPeriod/PreviousValueCell";
import type { CurrencyCode } from "@/lib/currency";
import { CampaignStatusSwitch } from "../CampaignStatusSwitch";
import type { ReportCampaignRow } from "../data/reportData";
import type { ReportFigures } from "../metrics/reportFigures";
import {
  formatMetricValue,
  isMetricAvailable,
  readMetric,
  REPORT_METRICS,
} from "../metrics/reportMetrics";
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
  /**
   * The previous period's campaigns by key, compared while set. A campaign
   * missing from it did not run then.
   */
  previous?: Map<string, ReportCampaignRow>;
}

/** One platform's campaigns in a goal table, under its name, with a subtotal. */
export function GoalCampaignChannelRows({
  group,
  labelled,
  metrics,
  currency,
  previous,
}: GoalCampaignChannelRowsProps) {
  const label = REPORT_CHANNEL_LABELS[group.channel];
  const columns = metrics.length * (previous ? 2 : 1);
  return (
    <>
      {labelled && (
        <tr className="border-b bg-muted/40">
          <td colSpan={columns + 1} className="px-2 py-1.5">
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
            previous={
              previous ? (previous.get(row.key)?.figures ?? null) : undefined
            }
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
            previous={
              previous
                ? sumFigures(
                    [...previous.values()].filter(
                      (row) => row.channel === group.channel,
                    ),
                  )
                : undefined
            }
          />
        </tr>
      )}
    </>
  );
}

/**
 * A cell per metric; a dash where the row cannot measure it. While the
 * previous period is compared, each is followed by its previous value;
 * `previous` is null for a campaign that did not run then.
 */
export function MetricCells({
  metrics,
  figures,
  currency,
  previous,
}: {
  metrics: Array<ReportMetricKey>;
  figures: ReportFigures;
  currency: CurrencyCode;
  previous?: ReportFigures | null;
}) {
  return metrics.map((key) => {
    const metric = REPORT_METRICS[key];
    const before = previous ? metric.compute(previous) : null;
    return (
      <Fragment key={key}>
        <td className={CELL}>
          {isMetricAvailable(key, figures)
            ? readMetric(key, figures, currency).text
            : "—"}
        </td>
        {previous !== undefined && (
          <PreviousValueCell
            current={metric.compute(figures) ?? 0}
            previous={before ?? undefined}
            format={(value) =>
              formatMetricValue(metric.format, value, currency)
            }
            direction={GOOD_WHEN_DIRECTION[metric.goodWhen]}
            cellClassName={CELL}
          />
        )}
      </Fragment>
    );
  });
}

/** The report catalog's good direction as the comparison cell reads it. */
const GOOD_WHEN_DIRECTION = {
  up: "higher",
  down: "lower",
  either: "neutral",
} as const;
