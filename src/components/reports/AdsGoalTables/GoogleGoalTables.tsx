import { GoogleAdsGoalTable } from "@/components/dynamic-tables/GoogleAdsGoalTable/GoogleAdsGoalTable";
import { WooAttributionSection } from "@/components/dynamic-tables/WooAttributionSection";
import { AllGoalsSpendRow } from "@/components/reports/AllGoalsSpendRow";
import { Card } from "@/components/ui/card";
import type { AdsEntityLevel } from "@/lib/adsEntityLevel";
import type {
  AdsReportRecord,
  AdsReportTable,
  GoogleWooOverlay,
} from "./adsGoalTablesTypes";
import { entityColumnLabel } from "./entityColumnLabel";
import { googleGoalReport, googlePreviousReport } from "./googleGoalReport";
import { googleSalesChecks } from "./googleSalesChecks";
import { TrackingWarnings, WooTotalsNote } from "./GoogleSalesNotes";

type Props = {
  table: AdsReportTable;
  records: Array<AdsReportRecord>;
  previousRecords: Array<AdsReportRecord> | undefined;
  level: AdsEntityLevel;
  currency: string;
  woo: GoogleWooOverlay | null;
  /** The notes on suspicious conversion values, meant for the agency. */
  showTrackingWarnings: boolean;
};

/**
 * A Google Ads report's tables, one per campaign goal, with the WooCommerce
 * attribution that replaces the sales totals when the report uses it.
 */
export function GoogleGoalTables({
  table,
  records,
  previousRecords,
  level,
  currency,
  woo,
  showTrackingWarnings,
}: Props) {
  const report = googleGoalReport(records, table, level);
  const previous = previousRecords
    ? googlePreviousReport(previousRecords, table, level)
    : null;
  const wooTotals = woo
    ? {
        conversions: woo.googlePaid.paidOrders,
        revenue: woo.googlePaid.paidRevenue,
      }
    : null;
  const checks = googleSalesChecks({
    totals: report.totals,
    isEcommerce: report.isEcommerce,
    woo: wooTotals,
  });
  // WooCommerce replaces the sales totals only.
  const wooOnSalesTotals =
    !!woo && report.sections.some((section) => section.goal === "ecommerce");
  const salesTotalLabel = report.mixedGoals
    ? "שורת סה״כ המכירות"
    : "שורת הסה״כ";

  return (
    <>
      {woo && (
        <div className="mb-4">
          <WooAttributionSection
            orders={woo.orders}
            formatCurrency={(n) =>
              `${currency}${Math.round(n).toLocaleString("he-IL")}`
            }
            formatNumber={(n) => Math.round(n).toLocaleString("he-IL")}
          />
        </div>
      )}
      <Card className="mb-4 overflow-hidden">
        <div className="overflow-x-auto">
          {woo && wooOnSalesTotals && (
            <WooTotalsNote
              googlePaid={woo.googlePaid}
              ecommerceTotals={report.ecommerceTotals}
              salesTotalLabel={salesTotalLabel}
              currency={currency}
            />
          )}
          {showTrackingWarnings && (
            <TrackingWarnings
              checks={checks}
              totals={report.totals}
              currency={currency}
            />
          )}
          {report.sections.map(({ goal, rows }) => (
            <GoogleAdsGoalTable
              key={goal}
              goal={goal}
              rows={rows}
              entityColumnLabel={entityColumnLabel(level)}
              currency={currency}
              showTitle={report.mixedGoals}
              previous={
                previous
                  ? {
                      ...previous[goal],
                      // WooCommerce replaces the sales total, so Google's
                      // previous total does not compare.
                      total:
                        goal === "ecommerce" && woo
                          ? null
                          : previous[goal].total,
                    }
                  : null
              }
              wooTotals={wooTotals}
            />
          ))}
          {report.mixedGoals && (
            <AllGoalsSpendRow
              label="הוצאה כוללת (כל היעדים)"
              currency={currency}
              spend={report.totals.cost}
              className="px-3"
            />
          )}
          {woo && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              * טבלת &quot;רכישות לפי מקור הגעה&quot; למעלה
              {wooOnSalesTotals ? ` ו${salesTotalLabel} מבוססות` : " מבוססת"} על
              WooCommerce Order Attribution. עמודות לפי קמפיין = דיווח Google
              Ads.
            </p>
          )}
        </div>
      </Card>
    </>
  );
}
