import { Fragment } from "react";
import { ReportNameCell } from "@/components/report-ui/ReportTable";
import { PreviousValueHead } from "@/components/reports/PreviousPeriod/PreviousValueCell";
import {
  CAMPAIGN_GOAL_TITLES,
  CAMPAIGN_GOAL_TOTAL_LABELS,
} from "@/lib/campaignGoals";
import { formatReportNumber } from "@/lib/reportNumber";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import { GoogleMetricCells } from "./GoogleMetricCells";
import {
  type GoogleGoalMetrics,
  googleGoalHeaders,
  type GoogleTablePrevious,
  sumGoogleMetrics,
} from "./googleGoalMetrics";

export type GoogleAdsGoalTableRow = GoogleGoalMetrics & {
  key: string;
  name: string;
  /** A sales campaign's leads (calls, forms), apart from its purchases. */
  leads?: number;
  /** Campaign switched off; marked with the "כבוי" badge. */
  off?: boolean;
};

type Props = {
  goal: GoogleReportGoal;
  rows: Array<GoogleAdsGoalTableRow>;
  entityColumnLabel: string;
  currency: string;
  /** Heading above the table; used when the report has both goals. */
  showTitle?: boolean;
  /**
   * WooCommerce attribution replaces the sales total row. Rows keep the Google
   * Ads API numbers, so their columns are marked (GA).
   */
  wooTotals?: { conversions: number; revenue: number } | null;
  /** The previous period; its columns show while it is set. */
  previous?: GoogleTablePrevious | null;
};

/**
 * One goal of a Google Ads report table: sales campaigns with conversion value
 * and ROAS, lead campaigns with cost per lead, and campaigns set to pay for
 * exposure with clicks and cost per click only (AIO-496). A sales table adds
 * a leads column once a campaign also brought leads. Totals are of this goal
 * only. With the previous period on, the main metrics get its value beside
 * them.
 */
export function GoogleAdsGoalTable({
  goal,
  rows,
  entityColumnLabel,
  currency,
  showTitle = false,
  wooTotals,
  previous,
}: Props) {
  const isEcommerce = goal === "ecommerce";
  const woo = isEcommerce ? wooTotals : null;
  const summed = sumGoogleMetrics(rows);
  const totals: GoogleGoalMetrics = woo
    ? {
        ...summed,
        conversions: woo.conversions,
        conversions_value: woo.revenue,
      }
    : summed;
  const salesLeads = isEcommerce && rows.some((row) => (row.leads ?? 0) > 0);
  const totalLeads = rows.reduce((total, row) => total + (row.leads ?? 0), 0);
  /** A sales row's leads cell, when the table shows leads. */
  function leadsCell(leads: number) {
    return (
      salesLeads && (
        <td className="p-2 text-center">
          {formatReportNumber(Math.round(leads))}
        </td>
      )
    );
  }
  const totalLabel = showTitle ? CAMPAIGN_GOAL_TOTAL_LABELS[goal] : "סה״כ";

  return (
    <section aria-label={CAMPAIGN_GOAL_TITLES[goal]}>
      {showTitle && (
        <h4
          className="border-b bg-muted/30 px-3 py-2 text-sm font-semibold"
          dir="rtl"
        >
          {CAMPAIGN_GOAL_TITLES[goal]}
        </h4>
      )}
      <table className="w-full text-sm" dir="rtl">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="p-2 text-right font-medium">{entityColumnLabel}</th>
            {googleGoalHeaders(goal, { woo: !!woo, salesLeads }).map(
              ({ label, compared }) => (
                <Fragment key={label}>
                  <th className="p-2 text-center font-medium">{label}</th>
                  {previous && compared && <PreviousValueHead />}
                </Fragment>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b hover:bg-muted/30">
              <ReportNameCell
                name={row.name}
                on={row.off !== true}
                className="p-2 text-right"
              />
              <GoogleMetricCells
                m={row}
                previous={
                  previous ? (previous.byKey.get(row.key) ?? null) : undefined
                }
                goal={goal}
                currency={currency}
                isTotal={false}
              />
              {leadsCell(row.leads ?? 0)}
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-primary/10 font-bold">
          <tr>
            <td className="p-2 text-right">{totalLabel}</td>
            <GoogleMetricCells
              m={totals}
              previous={previous ? previous.total : undefined}
              goal={goal}
              currency={currency}
              isTotal
            />
            {leadsCell(totalLeads)}
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
