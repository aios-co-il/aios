import { REPORT_POSITIVE, ReportTd } from "@/components/report-ui/ReportTable";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import { ratio } from "@/lib/reportNumber";
import {
  googlePreviousCell,
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
  compared?: Partial<Record<string, GoogleComparedMetric>> | null;
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
  compared,
  previous,
  storeFromWoo = false,
  formatCurrency,
  formatNumber,
  formatUnitCost,
}: Props) {
  const totalCtr = ratio(groupTotals.clicks, groupTotals.impressions) * 100;
  const totalCpc = ratio(groupTotals.spend, groupTotals.clicks);
  const totalCpa = ratio(groupTotals.spend, groupTotals.conversions);
  const prev = googlePreviousCell(groupTotals, previous, compared);
  // The sales cells show the store's figures; WooCommerce's previous period
  // is not loaded, so they compare only when Google's own figures show.
  const storeShown = {
    ...groupTotals,
    conversions: store.purchases,
    conversions_value: store.revenue,
  };
  const prevStore = googlePreviousCell(
    storeShown,
    storeFromWoo && previous !== undefined ? null : previous,
    compared,
  );
  return (
    <>
      <ReportTd>סה"כ</ReportTd>
      <ReportTd>{formatNumber(groupTotals.impressions)}</ReportTd>
      <ReportTd>{formatNumber(groupTotals.clicks)}</ReportTd>
      {prev("קליקים")}
      <ReportTd>{totalCtr.toFixed(2)}%</ReportTd>
      <ReportTd>{totalCpc > 0 ? formatUnitCost(totalCpc) : "-"}</ReportTd>
      <ReportTd>{formatCurrency(groupTotals.spend)}</ReportTd>
      {prev("הוצאה")}
      {goal === "traffic" ? null : goal === "ecommerce" ? (
        <>
          <ReportTd className={REPORT_POSITIVE}>
            {formatNumber(store.purchases)}
          </ReportTd>
          {prevStore("רכישות")}
          <ReportTd className={REPORT_POSITIVE}>
            {formatCurrency(store.revenue)}
          </ReportTd>
          {prevStore("הכנסות")}
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
          <ReportTd className={REPORT_POSITIVE}>
            {formatNumber(groupTotals.conversions)}
          </ReportTd>
          {prev("המרות")}
          <ReportTd>{totalCpa > 0 ? formatCurrency(totalCpa) : "-"}</ReportTd>
          {prev("עלות להמרה")}
        </>
      )}
    </>
  );
}
