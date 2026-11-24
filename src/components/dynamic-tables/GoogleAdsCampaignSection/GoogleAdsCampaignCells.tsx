import { Fragment } from "react";
import {
  REPORT_CELL,
  ReportTd,
  ReportTh,
} from "@/components/report-ui/ReportTable";
import {
  type ChangeMark,
  PreviousValueHead,
} from "@/components/reports/PreviousPeriod/PreviousValueCell";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import { ratio } from "@/lib/reportNumber";
import { cn } from "@/lib/utils";
import { MarkedCell } from "../MarkedCell";
import {
  googleChangeMark,
  googlePreviousCell,
  positiveTone,
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
  const mark = googleChangeMark(row, previous, compared);
  const conversionsMark = mark(goal === "ecommerce" ? "רכישות" : "המרות");
  const revenueMark = mark("הכנסות");
  const cpc = ratio(row.spend, row.clicks);
  const cpa = ratio(row.spend, row.conversions);
  const roas = ratio(row.conversions_value, row.spend);
  const aov = ratio(row.conversions_value, row.conversions);
  return (
    <>
      <ReportTd>{formatNumber(row.impressions)}</ReportTd>
      <MarkedCell className={REPORT_CELL} mark={mark("קליקים")}>
        {formatNumber(row.clicks)}
      </MarkedCell>
      {prev("קליקים")}
      <ReportTd>
        {(ratio(row.clicks, row.impressions) * 100).toFixed(2)}%
      </ReportTd>
      <ReportTd>{cpc > 0 ? formatUnitCost(cpc) : "-"}</ReportTd>
      <MarkedCell className={REPORT_CELL} mark={mark("הוצאה")}>
        {formatCurrency(row.spend)}
      </MarkedCell>
      {prev("הוצאה")}
      {goal === "traffic" ? null : goal === "ecommerce" ? (
        <>
          <MarkedCell
            className={cn(REPORT_CELL, good(row.conversions, conversionsMark))}
            mark={conversionsMark}
          >
            {formatNumber(row.conversions)}
          </MarkedCell>
          {prev("רכישות")}
          <MarkedCell
            className={cn(
              REPORT_CELL,
              good(row.conversions_value, revenueMark),
            )}
            mark={revenueMark}
          >
            {formatCurrency(row.conversions_value)}
          </MarkedCell>
          {prev("הכנסות")}
          <ReportTd>{roas > 0 ? roas.toFixed(2) : "-"}</ReportTd>
          <ReportTd>{aov > 0 ? formatCurrency(aov) : "-"}</ReportTd>
          {showLeads && <ReportTd>{formatNumber(row.leads ?? 0)}</ReportTd>}
        </>
      ) : (
        <>
          <MarkedCell
            className={cn(REPORT_CELL, good(row.conversions, conversionsMark))}
            mark={conversionsMark}
          >
            {formatNumber(row.conversions)}
          </MarkedCell>
          {prev("המרות")}
          <MarkedCell className={REPORT_CELL} mark={mark("עלות להמרה")}>
            {cpa > 0 ? formatCurrency(cpa) : "-"}
          </MarkedCell>
          {prev("עלות להמרה")}
        </>
      )}
    </>
  );
}

/** The accent for a positive result, under its change mark. */
function good(value: number, mark: ChangeMark | null): string | undefined {
  return value > 0 ? positiveTone(mark) : undefined;
}
