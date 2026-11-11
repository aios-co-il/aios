import {
  ReportNameCell,
  ReportTable,
  ReportTd,
  ReportTh,
  ReportTr,
} from "@/components/report-ui/ReportTable";
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

/**
 * One goal's campaigns in a week, with only that goal's columns and totals.
 * A campaign's switch is off when it was paused, removed or its report was
 * switched off; such a campaign shows in a week only when it spent.
 */
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
        <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
          {CAMPAIGN_GOAL_TITLES[group.kind]}
        </h4>
      )}
      <ReportTable
        className="min-w-[640px]"
        head={
          <>
            {showPlatform && <ReportTh>פלטפורמה</ReportTh>}
            <ReportTh>קמפיין</ReportTh>
            {columns.map((column) => (
              <ReportTh key={column.label}>{column.label}</ReportTh>
            ))}
          </>
        }
        foot={
          <>
            {showPlatform && <ReportTd />}
            <ReportTd>
              {showTitle
                ? CAMPAIGN_GOAL_TOTAL_LABELS[group.kind]
                : "סה״כ שבועי"}
            </ReportTd>
            <MetricCells
              metrics={group.totals}
              columns={columns}
              currency={currency}
            />
          </>
        }
      >
        {group.rows.map((row) => (
          <ReportTr key={row.key}>
            {showPlatform && <ReportTd>{sourceLabel[row.source]}</ReportTd>}
            <ReportNameCell name={row.campaign} on={!row.off} />
            <MetricCells metrics={row} columns={columns} currency={currency} />
          </ReportTr>
        ))}
      </ReportTable>
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
        <ReportTd key={column.label} className={column.className}>
          {column.value(metrics, currency)}
        </ReportTd>
      ))}
    </>
  );
}

const sourceLabel: Record<WeeklyAdsSource, string> = {
  facebook_insights: "Facebook",
  facebook_ecommerce: "Facebook",
  google_ads: "Google Ads",
};
