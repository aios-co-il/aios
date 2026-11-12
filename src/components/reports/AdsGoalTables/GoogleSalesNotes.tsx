import type { WooGoogleAttributionSummary } from "@/lib/wooAttribution";
import { formatReportNumber } from "@/lib/reportNumber";
import type { GoogleReportTotals } from "./googleGoalReport";
import type { GoogleSalesChecks } from "./googleSalesChecks";

type WooTotalsNoteProps = {
  googlePaid: WooGoogleAttributionSummary;
  /** Google Ads' own sales conversions and value, shown when WooCommerce differs. */
  ecommerceTotals: { conversions: number; conversions_value: number };
  salesTotalLabel: string;
  currency: string;
};

/** Says that the sales total row comes from WooCommerce, and what Google Ads reported. */
export function WooTotalsNote({
  googlePaid,
  ecommerceTotals,
  salesTotalLabel,
  currency,
}: WooTotalsNoteProps) {
  const differs =
    Math.round(googlePaid.paidOrders) !==
      Math.round(ecommerceTotals.conversions) ||
    Math.abs(googlePaid.paidRevenue - ecommerceTotals.conversions_value) > 1;
  return (
    <div className="m-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100">
      <p>
        {salesTotalLabel} מבוססת על WooCommerce (Google Ads):{" "}
        {Math.round(googlePaid.paidOrders)} רכישות, {currency}
        {formatReportNumber(googlePaid.paidRevenue)}.
        {differs && (
          <>
            {" "}
            דיווח Google Ads API: {Math.round(ecommerceTotals.conversions)}{" "}
            המרות, {currency}
            {formatReportNumber(ecommerceTotals.conversions_value)}.
          </>
        )}
        {googlePaid.organicOrders > 0 && (
          <>
            {" "}
            בנוסף {googlePaid.organicOrders} רכישות Google אורגני ({currency}
            {formatReportNumber(googlePaid.organicRevenue)}).
          </>
        )}
      </p>
      <p className="mt-1 text-xs opacity-90">
        הוספה לעגלה אינה זמינה מ-WooCommerce (רק רכישות). עמודות לפי קמפיין
        מציגות המרות מ-Google Ads API.
      </p>
    </div>
  );
}

type TrackingWarningsProps = {
  checks: GoogleSalesChecks;
  totals: GoogleReportTotals;
  currency: string;
};

/** Warns when Google Ads' conversion values look like a tracking setup problem. */
export function TrackingWarnings({
  checks,
  totals,
  currency,
}: TrackingWarningsProps) {
  if (!checks.suspiciousLowValue && !checks.allValueHigher) {
    return null;
  }
  return (
    <div className="m-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      {checks.suspiciousLowValue && (
        <p>
          ערך המרות נמוך מהצפוי ({currency}
          {Math.round(totals.conversions_value).toLocaleString("he-IL")} על{" "}
          {Math.round(totals.conversions)} המרות — כ־{currency}
          {checks.avgValuePerConv.toFixed(1)} להמרה). זה בדרך כלל מה ש־Google
          Ads מדווח ב־Conv. value (פעולות ראשיות), לא באג בשליפה. בדקו בחשבון:
          האם Purchase מסומן כראשי, והאם ה־tag באתר שולח value+currency.
        </p>
      )}
      {checks.allValueHigher && (
        <p className={checks.suspiciousLowValue ? "mt-1" : undefined}>
          ערך כל ההמרות (All conv. value) גבוה יותר: {currency}
          {Math.round(totals.all_conversions_value).toLocaleString("he-IL")} —
          ייתכן שערך הרכישות יושב על פעולת המרה משנית.
        </p>
      )}
    </div>
  );
}
