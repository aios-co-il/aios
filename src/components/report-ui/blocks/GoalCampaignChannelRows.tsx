import { Fragment } from "react";
import { MarkedCell } from "@/components/reports/PreviousPeriod/MarkedCell";
import { compareCellsFor } from "@/components/reports/PreviousPeriod/previousCells";
import type { DashboardCurrencies } from "@/lib/dashboardCurrencies";
import { CampaignStatusSwitch } from "../CampaignStatusSwitch";
import type { ReportCampaignRow } from "../data/reportData";
import type { ReportFigures } from "../metrics/reportFigures";
import {
  formatMetricValue,
  isMetricAvailable,
  REPORT_METRICS,
} from "../metrics/reportMetrics";
import {
  channelMoney,
  isSplitMetric,
  readReportMetric,
  type ReportMoney,
} from "../metrics/reportMoney";
import type { ReportMetricKey } from "../metrics/reportMetricTypes";
import { sumFigures, type ChannelGroup } from "./groupRowsByChannel";
import { REPORT_CHANNEL_LABELS } from "./reportChannels";

export const CELL = "px-2 py-2.5 text-start tabular-nums whitespace-nowrap";

interface GoalCampaignChannelRowsProps {
  group: ChannelGroup<ReportCampaignRow>;
  /** Show the platform's title and subtotal; off when it is the only one. */
  labelled: boolean;
  metrics: Array<ReportMetricKey>;
  currencies: DashboardCurrencies;
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
  currencies,
  previous,
}: GoalCampaignChannelRowsProps) {
  const label = REPORT_CHANNEL_LABELS[group.channel];
  // A platform's campaigns are all in its account's currency.
  const money = channelMoney(group.channel, currencies);
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
            money={money}
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
            money={money}
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
 * `previous` is null for a campaign that did not run then. The change's arrow
 * and colour mark the current value. An amount split by currency has no
 * single previous value to compare, so that cell is a dash and unmarked.
 */
export function MetricCells({
  metrics,
  figures,
  money,
  previous,
}: {
  metrics: Array<ReportMetricKey>;
  figures: ReportFigures;
  money: ReportMoney;
  previous?: ReportFigures | null;
}) {
  const compared = compareCellsFor(figures, previous, CELL);
  return metrics.map((key) => {
    const metric = REPORT_METRICS[key];
    const split = isSplitMetric(key, figures, money);
    const available = isMetricAvailable(key, figures);
    const cells = compared(
      (data) => (split ? null : comparedValue(key, data)),
      (value) => formatMetricValue(metric.format, value, money.ads),
      GOOD_WHEN_DIRECTION[metric.goodWhen],
    );
    return (
      <Fragment key={key}>
        <MarkedCell className={CELL} mark={cells.mark}>
          {available ? readReportMetric(key, figures, money).text : "—"}
        </MarkedCell>
        {cells.previousCell}
      </Fragment>
    );
  });
}

/**
 * A metric's value as the comparison reads it: null where the figures cannot
 * measure it, and for a cost of 0, which only means nothing was bought (no
 * leads for a cost per lead), so it is no fall in cost to mark.
 */
function comparedValue(
  key: ReportMetricKey,
  figures: ReportFigures,
): number | null {
  const metric = REPORT_METRICS[key];
  if (!isMetricAvailable(key, figures)) {
    return null;
  }
  const value = metric.compute(figures);
  return metric.goodWhen === "down" && value === 0 ? null : value;
}

/** The report catalog's good direction as the comparison cell reads it. */
const GOOD_WHEN_DIRECTION = {
  up: "higher",
  down: "lower",
  either: "neutral",
} as const;
