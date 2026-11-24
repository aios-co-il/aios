import { Fragment } from "react";
import {
  REPORT_CELL,
  REPORT_POSITIVE,
  ReportTd,
  ReportTh,
} from "@/components/report-ui/ReportTable";
import { MarkedCell } from "@/components/reports/PreviousPeriod/MarkedCell";
import { PreviousValueHead } from "@/components/reports/PreviousPeriod/PreviousValueCell";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import { ratio } from "@/lib/reportNumber";
import { cn } from "@/lib/utils";
import {
  googleComparedFor,
  type GoogleComparedMetric,
} from "./googleAdsCompare";
import type {
  GoogleAdsCampaignSummaryRow,
  GoogleAdsFormatters,
  GoogleAdsTotals,
} from "./types";

/**
 * The column heads of one goal's table, each compared column followed by its
 * previous-period head while `comparedMetrics` is set.
 */
export function GoogleAdsHeadCells({
  goal,
  showLeads,
  comparedMetrics,
}: {
  goal: GoogleReportGoal;
  showLeads: boolean;
  comparedMetrics?: Partial<Record<string, GoogleComparedMetric>> | null;
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
        {comparedMetrics?.[label] && (
          <PreviousValueHead cellClassName={REPORT_CELL} />
        )}
      </Fragment>
    ),
  );
}

/** One campaign's figures after its name. */
export function GoogleAdsCampaignCells({
  row,
  goal,
  showLeads,
  comparedMetrics,
  previous,
  formatCurrency,
  formatNumber,
  formatUnitCost,
}: GoogleAdsFormatters & {
  row: GoogleAdsCampaignSummaryRow;
  goal: GoogleReportGoal;
  showLeads: boolean;
  comparedMetrics?: Partial<Record<string, GoogleComparedMetric>> | null;
  /** The campaign's previous row; null when it did not run then. */
  previous?: GoogleAdsTotals | null;
}) {
  const compared = googleComparedFor(row, previous, comparedMetrics);
  const clicks = compared("קליקים");
  const spend = compared("הוצאה");
  const conversions = compared(goal === "ecommerce" ? "רכישות" : "המרות");
  const revenue = compared("הכנסות");
  const costPerConversion = compared("עלות להמרה");
  const cpc = ratio(row.spend, row.clicks);
  const cpa = ratio(row.spend, row.conversions);
  const roas = ratio(row.conversions_value, row.spend);
  const aov = ratio(row.conversions_value, row.conversions);
  return (
    <>
      <ReportTd>{formatNumber(row.impressions)}</ReportTd>
      <MarkedCell className={REPORT_CELL} mark={clicks.mark}>
        {formatNumber(row.clicks)}
      </MarkedCell>
      {clicks.previousCell}
      <ReportTd>
        {(ratio(row.clicks, row.impressions) * 100).toFixed(2)}%
      </ReportTd>
      <ReportTd>{cpc > 0 ? formatUnitCost(cpc) : "-"}</ReportTd>
      <MarkedCell className={REPORT_CELL} mark={spend.mark}>
        {formatCurrency(row.spend)}
      </MarkedCell>
      {spend.previousCell}
      {goal === "traffic" ? null : (
        <>
          <MarkedCell
            className={cn(REPORT_CELL, row.conversions > 0 && REPORT_POSITIVE)}
            mark={conversions.mark}
          >
            {formatNumber(row.conversions)}
          </MarkedCell>
          {conversions.previousCell}
          {goal === "ecommerce" ? (
            <>
              <MarkedCell
                className={cn(
                  REPORT_CELL,
                  row.conversions_value > 0 && REPORT_POSITIVE,
                )}
                mark={revenue.mark}
              >
                {formatCurrency(row.conversions_value)}
              </MarkedCell>
              {revenue.previousCell}
              <ReportTd>{roas > 0 ? roas.toFixed(2) : "-"}</ReportTd>
              <ReportTd>{aov > 0 ? formatCurrency(aov) : "-"}</ReportTd>
              {showLeads && <ReportTd>{formatNumber(row.leads ?? 0)}</ReportTd>}
            </>
          ) : (
            <>
              <MarkedCell className={REPORT_CELL} mark={costPerConversion.mark}>
                {cpa > 0 ? formatCurrency(cpa) : "-"}
              </MarkedCell>
              {costPerConversion.previousCell}
            </>
          )}
        </>
      )}
    </>
  );
}
