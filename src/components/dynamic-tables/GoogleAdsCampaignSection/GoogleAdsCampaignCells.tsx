import { Fragment } from "react";
import {
  REPORT_CELL,
  REPORT_POSITIVE,
  ReportTd,
  ReportTh,
} from "@/components/report-ui/ReportTable";
import { PreviousValueHead } from "@/components/reports/PreviousPeriod/PreviousValueCell";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import { ratio } from "@/lib/reportNumber";
import {
  googlePreviousCell,
  type GoogleComparedMetric,
} from "./googleAdsCompare";
import type {
  GoogleAdsCampaignSummaryRow,
  GoogleAdsFormatters,
  GoogleAdsTotals,
} from "./types";

/**
 * The column heads of one goal's table, each compared column followed by its
 * previous-period head while `compared` is set.
 */
export function GoogleAdsHeadCells({
  goal,
  showLeads,
  compared,
}: {
  goal: GoogleReportGoal;
  showLeads: boolean;
  compared?: Partial<Record<string, GoogleComparedMetric>> | null;
}) {
  const results =
    goal === "traffic"
      ? []
      : goal === "ecommerce"
        ? ["רכישות", "הכנסות", "ROAS", "AOV", ...(showLeads ? ["לידים"] : [])]
        : ["המרות", "עלות להמרה"];
  return ["קמפיין", "חשיפות", "קליקים", "CTR", "CPC", "הוצאה", ...results].map(
    (label) => (
      <Fragment key={label}>
        <ReportTh>{label}</ReportTh>
        {compared?.[label] && <PreviousValueHead cellClassName={REPORT_CELL} />}
      </Fragment>
    ),
  );
}

/** One campaign's figures after its name. */
export function GoogleAdsCampaignCells({
  row,
  goal,
  showLeads,
  compared,
  previous,
  formatCurrency,
  formatNumber,
  formatUnitCost,
}: GoogleAdsFormatters & {
  row: GoogleAdsCampaignSummaryRow;
  goal: GoogleReportGoal;
  showLeads: boolean;
  compared?: Partial<Record<string, GoogleComparedMetric>> | null;
  /** The campaign's previous row; null when it did not run then. */
  previous?: GoogleAdsTotals | null;
}) {
  const prev = googlePreviousCell(row, previous, compared);
  const cpc = ratio(row.spend, row.clicks);
  const cpa = ratio(row.spend, row.conversions);
  const roas = ratio(row.conversions_value, row.spend);
  const aov = ratio(row.conversions_value, row.conversions);
  return (
    <>
      <ReportTd>{formatNumber(row.impressions)}</ReportTd>
      <ReportTd>{formatNumber(row.clicks)}</ReportTd>
      {prev("קליקים")}
      <ReportTd>
        {(ratio(row.clicks, row.impressions) * 100).toFixed(2)}%
      </ReportTd>
      <ReportTd>{cpc > 0 ? formatUnitCost(cpc) : "-"}</ReportTd>
      <ReportTd>{formatCurrency(row.spend)}</ReportTd>
      {prev("הוצאה")}
      {goal === "traffic" ? null : goal === "ecommerce" ? (
        <>
          <ReportTd className={good(row.conversions)}>
            {formatNumber(row.conversions)}
          </ReportTd>
          {prev("רכישות")}
          <ReportTd className={good(row.conversions_value)}>
            {formatCurrency(row.conversions_value)}
          </ReportTd>
          {prev("הכנסות")}
          <ReportTd>{roas > 0 ? roas.toFixed(2) : "-"}</ReportTd>
          <ReportTd>{aov > 0 ? formatCurrency(aov) : "-"}</ReportTd>
          {showLeads && <ReportTd>{formatNumber(row.leads ?? 0)}</ReportTd>}
        </>
      ) : (
        <>
          <ReportTd className={good(row.conversions)}>
            {formatNumber(row.conversions)}
          </ReportTd>
          {prev("המרות")}
          <ReportTd>{cpa > 0 ? formatCurrency(cpa) : "-"}</ReportTd>
          {prev("עלות להמרה")}
        </>
      )}
    </>
  );
}

/** The accent for a positive result. */
function good(value: number): string | undefined {
  return value > 0 ? REPORT_POSITIVE : undefined;
}
