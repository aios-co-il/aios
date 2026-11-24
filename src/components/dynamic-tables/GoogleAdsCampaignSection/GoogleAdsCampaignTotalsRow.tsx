import {
  REPORT_CELL,
  REPORT_POSITIVE,
  ReportTd,
} from "@/components/report-ui/ReportTable";
import { MarkedCell } from "@/components/reports/PreviousPeriod/MarkedCell";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import { ratio } from "@/lib/reportNumber";
import { cn } from "@/lib/utils";
import {
  googleComparedFor,
  type GoogleComparedMetric,
} from "./googleAdsCompare";
import type {
  GoogleAdsFormatters,
  GoogleAdsTotals,
  GoogleStoreTotals,
} from "./types";

type Props = GoogleAdsFormatters & {
  goal: GoogleReportGoal;
  /** The sales table shows a leads column. */
  showLeads?: boolean;
  groupTotals: GoogleAdsTotals;
  store: GoogleStoreTotals;
  comparedMetrics?: Partial<Record<string, GoogleComparedMetric>> | null;
  /** The table's previous total; Google's own figures, never WooCommerce's. */
  previous?: GoogleAdsTotals | null;
  /** The store totals come from WooCommerce, which has no previous figures here. */
  storeFromWoo?: boolean;
};

/**
 * Total row cells of one goal's table, under the name column; the
 * sales columns use the store totals (WooCommerce when it overlays).
 */
export function GoogleAdsCampaignTotalsRow({
  goal,
  showLeads = false,
  groupTotals,
  store,
  comparedMetrics,
  previous,
  storeFromWoo = false,
  formatCurrency,
  formatNumber,
  formatUnitCost,
}: Props) {
  const totalCtr = ratio(groupTotals.clicks, groupTotals.impressions) * 100;
  const totalCpc = ratio(groupTotals.spend, groupTotals.clicks);
  const totalCpa = ratio(groupTotals.spend, groupTotals.conversions);
  const compared = googleComparedFor(groupTotals, previous, comparedMetrics);
  const clicks = compared("קליקים");
  const spend = compared("הוצאה");
  const conversions = compared("המרות");
  const costPerConversion = compared("עלות להמרה");
  // The sales cells show the store's figures; WooCommerce's previous period
  // is not loaded, so they compare only when Google's own figures show.
  const storeShown = {
    ...groupTotals,
    conversions: store.purchases,
    conversions_value: store.revenue,
  };
  const storePrevious =
    storeFromWoo && previous !== undefined ? null : previous;
  const comparedStore = googleComparedFor(
    storeShown,
    storePrevious,
    comparedMetrics,
  );
  const purchases = comparedStore("רכישות");
  const revenue = comparedStore("הכנסות");
  return (
    <>
      <ReportTd>סה"כ</ReportTd>
      <ReportTd>{formatNumber(groupTotals.impressions)}</ReportTd>
      <MarkedCell className={REPORT_CELL} mark={clicks.mark}>
        {formatNumber(groupTotals.clicks)}
      </MarkedCell>
      {clicks.previousCell}
      <ReportTd>{totalCtr.toFixed(2)}%</ReportTd>
      <ReportTd>{totalCpc > 0 ? formatUnitCost(totalCpc) : "-"}</ReportTd>
      <MarkedCell className={REPORT_CELL} mark={spend.mark}>
        {formatCurrency(groupTotals.spend)}
      </MarkedCell>
      {spend.previousCell}
      {goal === "traffic" ? null : goal === "ecommerce" ? (
        <>
          <MarkedCell
            className={cn(REPORT_CELL, REPORT_POSITIVE)}
            mark={purchases.mark}
          >
            {formatNumber(store.purchases)}
          </MarkedCell>
          {purchases.previousCell}
          <MarkedCell
            className={cn(REPORT_CELL, REPORT_POSITIVE)}
            mark={revenue.mark}
          >
            {formatCurrency(store.revenue)}
          </MarkedCell>
          {revenue.previousCell}
          <ReportTd>
            {groupTotals.spend > 0 ? store.roas.toFixed(2) : "-"}
          </ReportTd>
          <ReportTd>
            {store.purchases > 0
              ? formatCurrency(store.revenue / store.purchases)
              : "-"}
          </ReportTd>
          {showLeads && (
            <ReportTd>{formatNumber(groupTotals.leads ?? 0)}</ReportTd>
          )}
        </>
      ) : (
        <>
          <MarkedCell
            className={cn(REPORT_CELL, REPORT_POSITIVE)}
            mark={conversions.mark}
          >
            {formatNumber(groupTotals.conversions)}
          </MarkedCell>
          {conversions.previousCell}
          <MarkedCell className={REPORT_CELL} mark={costPerConversion.mark}>
            {totalCpa > 0 ? formatCurrency(totalCpa) : "-"}
          </MarkedCell>
          {costPerConversion.previousCell}
        </>
      )}
    </>
  );
}
