import {
  CAMPAIGN_GOAL_TITLES,
  CAMPAIGN_GOAL_TOTAL_LABELS,
} from "@/lib/campaignGoals";
import type { WeeklyAdsSource } from "@/lib/weeklyAdsComparison";
import type {
  WeeklyGoalGroup,
  WeeklyGoalTotals,
} from "@/lib/weeklyCampaignGoals";
import {
  weeklyGoalColumnsFor,
  type WeeklyGoalColumn,
} from "./weeklyGoalColumns";

type Props = {
  group: WeeklyGoalGroup;
  currency: string;
  showPlatform: boolean;
  /** Heading and goal total label; used when the week has several goals. */
  showTitle: boolean;
};

/** One goal's campaigns in a week, with only that goal's columns and totals. */
export function WeeklyGoalTable({
  group,
  currency,
  showPlatform,
  showTitle,
}: Props) {
  const columns = weeklyGoalColumnsFor(group);
  return (
    <section aria-label={CAMPAIGN_GOAL_TITLES[group.kind]}>
      {showTitle && (
        <h4 className="border-b bg-muted/10 px-4 py-2 text-sm font-semibold">
          {CAMPAIGN_GOAL_TITLES[group.kind]}
        </h4>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-muted/20">
            <tr>
              {showPlatform && (
                <th className="p-2 text-right font-medium">פלטפורמה</th>
              )}
              <th className="p-2 text-right font-medium">קמפיין</th>
              {columns.map((column) => (
                <th key={column.label} className="p-2 text-center font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <tr
                key={row.key}
                className="border-b last:border-0 hover:bg-muted/20"
              >
                {showPlatform && (
                  <td className="p-2 text-right">{sourceLabel[row.source]}</td>
                )}
                <td className="p-2 text-right font-medium">{row.campaign}</td>
                <MetricCells
                  metrics={row}
                  columns={columns}
                  currency={currency}
                />
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-primary/10 font-bold">
            <tr>
              {showPlatform && <td />}
              <td className="p-2 text-right">
                {showTitle
                  ? CAMPAIGN_GOAL_TOTAL_LABELS[group.kind]
                  : "סה״כ שבועי"}
              </td>
              <MetricCells
                metrics={group.totals}
                columns={columns}
                currency={currency}
              />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/** The goal's metric cells of one campaign or of the total row. */
function MetricCells({
  metrics,
  columns,
  currency,
}: {
  metrics: WeeklyGoalTotals;
  columns: WeeklyGoalColumn[];
  currency: string;
}) {
  return (
    <>
      {columns.map((column) => (
        <td
          key={column.label}
          className={`p-2 text-center ${column.className ?? ""}`}
        >
          {column.value(metrics, currency)}
        </td>
      ))}
    </>
  );
}

const sourceLabel: Record<WeeklyAdsSource, string> = {
  facebook_insights: "Facebook",
  facebook_ecommerce: "Facebook",
  google_ads: "Google Ads",
};
