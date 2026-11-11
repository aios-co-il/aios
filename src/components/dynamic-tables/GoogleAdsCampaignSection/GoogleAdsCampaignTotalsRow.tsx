import { REPORT_POSITIVE, ReportTd } from "@/components/report-ui/ReportTable";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import { ratio } from "@/lib/reportNumber";
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
  formatCurrency,
  formatNumber,
  formatUnitCost,
}: Props) {
  const totalCtr = ratio(groupTotals.clicks, groupTotals.impressions) * 100;
  const totalCpc = ratio(groupTotals.spend, groupTotals.clicks);
  const totalCpa = ratio(groupTotals.spend, groupTotals.conversions);
  return (
    <>
      <ReportTd>סה"כ</ReportTd>
      <ReportTd>{formatNumber(groupTotals.impressions)}</ReportTd>
      <ReportTd>{formatNumber(groupTotals.clicks)}</ReportTd>
      <ReportTd>{totalCtr.toFixed(2)}%</ReportTd>
      <ReportTd>{totalCpc > 0 ? formatUnitCost(totalCpc) : "-"}</ReportTd>
      <ReportTd>{formatCurrency(groupTotals.spend)}</ReportTd>
      {goal === "traffic" ? null : goal === "ecommerce" ? (
        <>
          <ReportTd className={REPORT_POSITIVE}>
            {formatNumber(store.purchases)}
          </ReportTd>
          <ReportTd className={REPORT_POSITIVE}>
            {formatCurrency(store.revenue)}
          </ReportTd>
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
          <ReportTd>{totalCpa > 0 ? formatCurrency(totalCpa) : "-"}</ReportTd>
        </>
      )}
    </>
  );
}
