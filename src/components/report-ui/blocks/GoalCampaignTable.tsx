import { Megaphone } from "lucide-react";
import { useState } from "react";
import {
  CAMPAIGN_GOAL_TITLES,
  CAMPAIGN_GOAL_TOTAL_LABELS,
  type ReportCampaignGoal,
} from "@/lib/campaignGoals";
import type { CurrencyCode } from "@/lib/currency";
import { CampaignStatusSwitch } from "../CampaignStatusSwitch";
import { ReportSection } from "../ReportSection";
import { ShowOffRowsToggle } from "../ShowOffRowsToggle";
import type { ReportScopeData } from "../data/reportData";
import {
  addAdsFigures,
  emptyReportFigures,
  type ReportFigures,
} from "../metrics/reportFigures";
import {
  isMetricAvailable,
  readMetric,
  REPORT_METRICS,
} from "../metrics/reportMetrics";
import type { ReportMetricKey } from "../metrics/reportMetricTypes";
import { REPORT_CHANNEL_LABELS } from "./reportChannels";

interface GoalCampaignTableProps {
  goal: ReportCampaignGoal;
  scope: ReportScopeData;
  /** The columns after the name and status, from the goal's layout. */
  metrics: Array<ReportMetricKey>;
  currency: CurrencyCode;
}

const CELL = "px-2 py-2.5 text-start tabular-nums whitespace-nowrap";

/**
 * A goal's campaigns with that goal's columns, the platform's on/off state
 * and a filter for the switched-off ones. The total row adds the campaigns as
 * the platforms report them, so it matches the rows shown above it.
 */
export function GoalCampaignTable({
  goal,
  scope,
  metrics,
  currency,
}: GoalCampaignTableProps) {
  const [showOff, setShowOff] = useState(true);
  if (scope.campaigns.length === 0) {
    return null;
  }
  const rows = scope.campaigns.filter((row) => showOff || row.on !== false);
  // Added up from the rows shown, so hiding the off campaigns updates it.
  const total: ReportFigures = rows.reduce(
    (sum, row) => addAdsFigures(sum, row.figures),
    emptyReportFigures(),
  );
  return (
    <ReportSection
      title={CAMPAIGN_GOAL_TITLES[goal]}
      icon={Megaphone}
      actions={
        <ShowOffRowsToggle
          level="campaign"
          checked={showOff}
          onCheckedChange={setShowOff}
        />
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className={`${CELL} font-medium`}>קמפיין</th>
              <th className={`${CELL} font-medium`}>סטטוס</th>
              {metrics.map((key) => (
                <th key={key} className={`${CELL} font-medium`}>
                  {REPORT_METRICS[key].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b last:border-0">
                <td className="max-w-[18rem] px-2 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="shrink-0">
                      {REPORT_CHANNEL_LABELS[row.channel].mark}
                    </span>
                    <span className="truncate" title={row.name}>
                      {row.name}
                    </span>
                  </span>
                </td>
                <td className={CELL}>
                  <CampaignStatusSwitch on={row.on} />
                </td>
                <MetricCells
                  metrics={metrics}
                  figures={row.figures}
                  currency={currency}
                />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="px-2 py-2.5" colSpan={2}>
                {CAMPAIGN_GOAL_TOTAL_LABELS[goal]}
              </td>
              <MetricCells
                metrics={metrics}
                figures={total}
                currency={currency}
              />
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportSection>
  );
}

/** A cell per metric; a dash where the row cannot measure it. */
function MetricCells({
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
