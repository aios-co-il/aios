import {
  REPORT_POSITIVE,
  ReportTd,
  ReportTh,
} from "@/components/report-ui/ReportTable";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import { ratio } from "@/lib/reportNumber";
import type { GoogleAdsCampaignSummaryRow, GoogleAdsFormatters } from "./types";

/** The column heads of one goal's table. */
export function GoogleAdsHeadCells({
  goal,
  showLeads,
}: {
  goal: GoogleReportGoal;
  showLeads: boolean;
}) {
  const results =
    goal === "traffic"
      ? []
      : goal === "ecommerce"
        ? ["רכישות", "הכנסות", "ROAS", "AOV", ...(showLeads ? ["לידים"] : [])]
        : ["המרות", "עלות להמרה"];
  return ["קמפיין", "חשיפות", "קליקים", "CTR", "CPC", "הוצאה", ...results].map(
    (label) => <ReportTh key={label}>{label}</ReportTh>,
  );
}

/** One campaign's figures after its name. */
export function GoogleAdsCampaignCells({
  row,
  goal,
  showLeads,
  formatCurrency,
  formatNumber,
  formatUnitCost,
}: GoogleAdsFormatters & {
  row: GoogleAdsCampaignSummaryRow;
  goal: GoogleReportGoal;
  showLeads: boolean;
}) {
  const cpc = ratio(row.spend, row.clicks);
  const cpa = ratio(row.spend, row.conversions);
  const roas = ratio(row.conversions_value, row.spend);
  const aov = ratio(row.conversions_value, row.conversions);
  return (
    <>
      <ReportTd>{formatNumber(row.impressions)}</ReportTd>
      <ReportTd>{formatNumber(row.clicks)}</ReportTd>
      <ReportTd>
        {(ratio(row.clicks, row.impressions) * 100).toFixed(2)}%
      </ReportTd>
      <ReportTd>{cpc > 0 ? formatUnitCost(cpc) : "-"}</ReportTd>
      <ReportTd>{formatCurrency(row.spend)}</ReportTd>
      {goal === "traffic" ? null : goal === "ecommerce" ? (
        <>
          <ReportTd className={good(row.conversions)}>
            {formatNumber(row.conversions)}
          </ReportTd>
          <ReportTd className={good(row.conversions_value)}>
            {formatCurrency(row.conversions_value)}
          </ReportTd>
          <ReportTd>{roas > 0 ? roas.toFixed(2) : "-"}</ReportTd>
          <ReportTd>{aov > 0 ? formatCurrency(aov) : "-"}</ReportTd>
          {showLeads && <ReportTd>{formatNumber(row.leads ?? 0)}</ReportTd>}
        </>
      ) : (
        <>
          <ReportTd className={good(row.conversions)}>
            {formatNumber(row.conversions)}
          </ReportTd>
          <ReportTd>{cpa > 0 ? formatCurrency(cpa) : "-"}</ReportTd>
        </>
      )}
    </>
  );
}

/** The accent for a positive result. */
function good(value: number): string | undefined {
  return value > 0 ? REPORT_POSITIVE : undefined;
}
