import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";

/** The numbers each Google report row and total carries. */
export type GoogleGoalMetrics = {
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  conversions_value: number;
};

/** One Google goal table's previous period, for its comparison columns. */
export type GoogleTablePrevious = {
  /** Each entity's previous numbers, keyed like the table's rows. */
  byKey: Map<string, GoogleGoalMetrics>;
  /** The table's previous total; null when it cannot be compared. */
  total: GoogleGoalMetrics | null;
};

/** One column of a goal table's header. */
export type GoogleGoalHeader = { label: string; compared?: boolean };

/**
 * The header cells of one goal's table in order. Compared ones get a
 * previous-period column: clicks, cost and cost per click for traffic,
 * conversions, cost, value and ROAS or cost per lead otherwise.
 */
export function googleGoalHeaders(
  goal: GoogleReportGoal,
  options: { woo: boolean; salesLeads: boolean },
): Array<GoogleGoalHeader> {
  if (goal === "traffic") {
    return [
      { label: "חשיפות" },
      { label: "קליקים", compared: true },
      { label: "עלות", compared: true },
      { label: "עלות לקליק", compared: true },
    ];
  }
  const isEcommerce = goal === "ecommerce";
  return [
    { label: "חשיפות" },
    { label: "קליקים" },
    {
      label: options.woo ? "המרות (GA)" : isEcommerce ? "המרות" : "לידים",
      compared: true,
    },
    { label: "עלות", compared: true },
    ...(isEcommerce
      ? [{ label: options.woo ? "ערך (GA)" : "ערך המרות", compared: true }]
      : []),
    { label: isEcommerce ? "ROAS" : "עלות לליד", compared: true },
    ...(options.salesLeads ? [{ label: "לידים" }] : []),
  ];
}

/** The rows' numbers added up. */
export function sumGoogleMetrics(
  rows: Array<GoogleGoalMetrics>,
): GoogleGoalMetrics {
  return rows.reduce(
    (total, row) => ({
      impressions: total.impressions + row.impressions,
      clicks: total.clicks + row.clicks,
      conversions: total.conversions + row.conversions,
      cost: total.cost + row.cost,
      conversions_value: total.conversions_value + row.conversions_value,
    }),
    {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      cost: 0,
      conversions_value: 0,
    },
  );
}
