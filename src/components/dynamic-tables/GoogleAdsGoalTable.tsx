import type { GoogleReportCampaignGoal } from "@/lib/pulseCampaignGoals";

type Metrics = {
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  conversions_value: number;
};

export type GoogleAdsGoalTableRow = Metrics & { key: string; name: string };

type Props = {
  goal: GoogleReportCampaignGoal;
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

const goalTitle: Record<GoogleReportCampaignGoal, string> = {
  ecommerce: "קמפייני מכירות",
  leads: "קמפייני לידים",
};

const fmt = (value: number, digits = 0) =>
  value.toLocaleString("he-IL", { maximumFractionDigits: digits });
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Metric cells of a row or of the total row; sales and leads differ. */
function MetricCells({
  m,
  isEcommerce,
  currency,
  emphasis,
}: {
  m: Metrics;
  isEcommerce: boolean;
  currency: string;
  emphasis: string;
}) {
  return (
    <>
      <td className="p-2 text-center">{fmt(m.impressions)}</td>
      <td className="p-2 text-center">{fmt(m.clicks)}</td>
      <td className={`p-2 text-center text-green-600${emphasis}`}>
        {fmt(Math.round(m.conversions))}
      </td>
      <td className="p-2 text-center">
        {currency}
        {fmt(m.cost)}
      </td>
      {isEcommerce ? (
        <>
          <td className={`p-2 text-center text-purple-600${emphasis}`}>
            {currency}
            {fmt(m.conversions_value)}
          </td>
          <td className={`p-2 text-center text-blue-600${emphasis}`}>
            {fmt(ratio(m.conversions_value, m.cost), 2)}x
          </td>
        </>
      ) : (
        <td className={`p-2 text-center text-blue-600${emphasis}`}>
          {currency}
          {fmt(ratio(m.cost, m.conversions), 1)}
        </td>
      )}
    </>
  );
}

/**
 * One goal of a Google Ads report table: sales campaigns with conversion value
 * and ROAS, lead campaigns with cost per lead. Totals are of this goal only.
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
  const totalLabel = !showTitle
    ? "סה״כ"
    : isEcommerce
      ? "סה״כ מכירות"
      : "סה״כ לידים";
  const header = (label: string) => (
    <th className="p-2 text-center font-medium">{label}</th>
  );

  return (
    <section aria-label={goalTitle[goal]}>
      {showTitle && (
        <h4
          className="border-b bg-muted/30 px-3 py-2 text-sm font-semibold"
          dir="rtl"
        >
          {goalTitle[goal]}
        </h4>
      )}
      <table className="w-full text-sm" dir="rtl">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="p-2 text-right font-medium">{entityColumnLabel}</th>
            {header("חשיפות")}
            {header("קליקים")}
            {header(woo ? "המרות (GA)" : isEcommerce ? "המרות" : "לידים")}
            {header("עלות")}
            {isEcommerce && header(woo ? "ערך (GA)" : "ערך המרות")}
            {header(isEcommerce ? "ROAS" : "עלות לליד")}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b hover:bg-muted/30">
              <td className="p-2 text-right font-medium">{row.name}</td>
              <MetricCells
                m={row}
                isEcommerce={isEcommerce}
                currency={currency}
                emphasis=" font-medium"
              />
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-primary/10 font-bold">
          <tr>
            <td className="p-2 text-right">{totalLabel}</td>
            <MetricCells
              m={totals}
              isEcommerce={isEcommerce}
              currency={currency}
              emphasis=""
            />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
