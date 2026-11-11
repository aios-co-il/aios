import { Megaphone } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import {
  CAMPAIGN_GOAL_TITLES,
  CAMPAIGN_GOAL_TOTAL_LABELS,
  type ReportCampaignGoal,
} from "@/lib/campaignGoals";
import type { CurrencyCode } from "@/lib/currency";
import { ReportSection } from "../ReportSection";
import { ShowOffRowsToggle } from "../ShowOffRowsToggle";
import { PreviousValueHead } from "@/components/reports/PreviousPeriod/PreviousValueCell";
import type { ReportScopeData } from "../data/reportData";
import { REPORT_METRICS } from "../metrics/reportMetrics";
import type { ReportMetricKey } from "../metrics/reportMetricTypes";
import {
  CELL,
  GoalCampaignChannelRows,
  MetricCells,
} from "./GoalCampaignChannelRows";
import { groupRowsByChannel, sumFigures } from "./groupRowsByChannel";

interface GoalCampaignTableProps {
  goal: ReportCampaignGoal;
  scope: ReportScopeData;
  /** The columns after the name and status, from the goal's layout. */
  metrics: Array<ReportMetricKey>;
  currency: CurrencyCode;
}

/**
 * A goal's campaigns with that goal's columns, grouped by platform, with the
 * platform's on/off state and a filter for the switched-off ones. The total
 * row adds the campaigns as the platforms report them, so it matches the rows
 * shown above it.
 */
export function GoalCampaignTable({
  goal,
  scope,
  metrics,
  currency,
}: GoalCampaignTableProps) {
  const [showOff, setShowOff] = useState(true);
  const previous = useMemo(
    () =>
      scope.previousCampaigns
        ? new Map(scope.previousCampaigns.map((row) => [row.key, row]))
        : undefined,
    [scope.previousCampaigns],
  );
  if (scope.campaigns.length === 0) {
    return null;
  }
  const rows = scope.campaigns.filter((row) => showOff || row.on !== false);
  const groups = groupRowsByChannel(rows);
  // Added up from the rows shown, so hiding the off campaigns updates it.
  const total = sumFigures(rows);
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
              {metrics.map((key) => (
                <Fragment key={key}>
                  <th className={`${CELL} font-medium`}>
                    {REPORT_METRICS[key].label}
                  </th>
                  {previous && <PreviousValueHead cellClassName={CELL} />}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <GoalCampaignChannelRows
                key={group.channel}
                group={group}
                labelled={groups.length > 1}
                metrics={metrics}
                currency={currency}
                previous={previous}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="px-2 py-2.5">
                {CAMPAIGN_GOAL_TOTAL_LABELS[goal]}
              </td>
              <MetricCells
                metrics={metrics}
                figures={total}
                currency={currency}
                previous={
                  scope.previousCampaigns
                    ? sumFigures(scope.previousCampaigns)
                    : undefined
                }
              />
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportSection>
  );
}
