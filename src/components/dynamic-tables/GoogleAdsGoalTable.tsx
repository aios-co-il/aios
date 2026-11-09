import { CampaignOffBadge } from "@/components/reports/CampaignOffBadge";
import {
  CAMPAIGN_GOAL_TITLES,
  CAMPAIGN_GOAL_TOTAL_LABELS,
} from "@/lib/campaignGoals";
import { formatReportNumber, ratio, resultCellClass } from "@/lib/reportNumber";
import type { GoogleReportGoal } from "../../../supabase/functions/_shared/campaign-goal/google-classify.ts";

type Metrics = {
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  conversions_value: number;
};

export type GoogleAdsGoalTableRow = Metrics & {
  key: string;
  name: string;
  /** A sales campaign's leads (calls, forms), apart from its purchases. */
  leads?: number;
  /** Campaign switched off; marked with the "כבוי" badge. */
  off?: boolean;
};

type Props = {
  goal: GoogleReportGoal;
  rows: GoogleAdsGoalTableRow[];
  entityColumnLabel: string;
  currency: string;
  /** Heading above the table; used when the report has both goals. */
  showTitle?: boolean;
  /**
   * WooCommerce attribution replaces the sales total row. Rows keep the Google
   * Ads API numbers, so their columns are marked (GA).
   */
  wooTotals?: { conversions: number; revenue: number } | null;
};

/**
 * One goal of a Google Ads report table: sales campaigns with conversion value
 * and ROAS, lead campaigns with cost per lead, and campaigns set to pay for
 * exposure with clicks and cost per click only (AIO-496). A sales table adds
 * a leads column once a campaign also brought leads. Totals are of this goal
 * only.
 */
export function GoogleAdsGoalTable({
  goal,
  rows,
  entityColumnLabel,
  currency,
  showTitle = false,
  wooTotals,
}: Props) {
  const isEcommerce = goal === "ecommerce";
  const isTraffic = goal === "traffic";
  const woo = isEcommerce ? wooTotals : null;
  const sum = (key: keyof Metrics) =>
    rows.reduce((total, row) => total + row[key], 0);
  const totals: Metrics = {
    impressions: sum("impressions"),
    clicks: sum("clicks"),
    conversions: woo ? woo.conversions : sum("conversions"),
    cost: sum("cost"),
    conversions_value: woo ? woo.revenue : sum("conversions_value"),
  };
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
  const header = (label: string) => (
    <th className="p-2 text-center font-medium">{label}</th>
  );

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
            {header("חשיפות")}
            {header("קליקים")}
            {!isTraffic &&
              header(woo ? "המרות (GA)" : isEcommerce ? "המרות" : "לידים")}
            {header("עלות")}
            {isEcommerce && header(woo ? "ערך (GA)" : "ערך המרות")}
            {header(
              isTraffic ? "עלות לקליק" : isEcommerce ? "ROAS" : "עלות לליד",
            )}
            {salesLeads && header("לידים")}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b hover:bg-muted/30">
              <td className="p-2 text-right font-medium">
                <CampaignOffBadge off={row.off === true} />
                {row.name}
              </td>
              <MetricCells
                m={row}
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
            <MetricCells m={totals} goal={goal} currency={currency} isTotal />
            {leadsCell(totalLeads)}
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

/** Metric cells of a row or of the total row; each goal has its own result columns. */
function MetricCells({
  m,
  goal,
  currency,
  isTotal,
}: {
  m: Metrics;
  goal: GoogleReportGoal;
  currency: string;
  isTotal: boolean;
}) {
  const cost = (
    <td className="p-2 text-center">
      {currency}
      {formatReportNumber(m.cost)}
    </td>
  );
  if (goal === "traffic") {
    return (
      <>
        <td className="p-2 text-center">{formatReportNumber(m.impressions)}</td>
        <td className="p-2 text-center">{formatReportNumber(m.clicks)}</td>
        {cost}
        <td className={resultCellClass("text-blue-600", isTotal)}>
          {currency}
          {formatReportNumber(ratio(m.cost, m.clicks), 2)}
        </td>
      </>
    );
  }
  return (
    <>
      <td className="p-2 text-center">{formatReportNumber(m.impressions)}</td>
      <td className="p-2 text-center">{formatReportNumber(m.clicks)}</td>
      <td className={resultCellClass("text-green-600", isTotal)}>
        {formatReportNumber(Math.round(m.conversions))}
      </td>
      {cost}
      {goal === "ecommerce" ? (
        <>
          <td className={resultCellClass("text-purple-600", isTotal)}>
            {currency}
            {formatReportNumber(m.conversions_value)}
          </td>
          <td className={resultCellClass("text-blue-600", isTotal)}>
            {formatReportNumber(ratio(m.conversions_value, m.cost), 2)}x
          </td>
        </>
      ) : (
        <td className={resultCellClass("text-blue-600", isTotal)}>
          {currency}
          {formatReportNumber(ratio(m.cost, m.conversions), 1)}
        </td>
      )}
    </>
  );
}
