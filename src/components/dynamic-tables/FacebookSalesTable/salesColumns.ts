import { facebookResultsColumnLabel } from "@/lib/facebookResultMetric";
import type { FacebookReportCampaign } from "../facebookReportCampaigns";

/** Which optional columns the sales table shows, from its campaigns. */
export type SalesColumns = {
  /** Cart and purchase value, and ROAS in place of cost per purchase. */
  value: boolean;
  leads: boolean;
  conversations: boolean;
  /** Meta's configured result, when some campaign optimizes for more than purchases. */
  results: boolean;
  resultsLabel: string;
  /** The result's own label goes in each cell when the column mixes kinds. */
  resultLabelInCell: boolean;
};

/** One column of the sales table's header. */
export type SalesHeader = { label: string; compared?: boolean };

/**
 * The columns the account tracks: no ROAS, value or cart without them (a sales
 * page without cart, no pixel value), and leads or conversations only when
 * some campaign has them.
 */
export function salesColumns(
  campaigns: Array<FacebookReportCampaign>,
): SalesColumns {
  /** One number summed over the campaigns. */
  function sum(
    key: "purchase_value" | "add_to_cart" | "leads" | "conversations",
  ) {
    return campaigns.reduce((total, campaign) => total + campaign[key], 0);
  }
  const results = campaigns.map((campaign) => campaign.result);
  const resultsLabel = facebookResultsColumnLabel(results);
  return {
    value: sum("purchase_value") > 0 || sum("add_to_cart") > 0,
    leads: sum("leads") > 0,
    conversations: sum("conversations") > 0,
    results: results.some(
      (result) => result.result_kind && result.result_kind !== "purchases",
    ),
    resultsLabel,
    resultLabelInCell: resultsLabel === "תוצאות",
  };
}

/** The header cells in table order; compared ones get a previous-period column. */
export function salesHeaders(columns: SalesColumns): Array<SalesHeader> {
  return [
    { label: "חשיפות" },
    { label: "קליקים" },
    { label: "הוצאה", compared: true },
    ...(columns.results
      ? [{ label: columns.resultsLabel }, { label: "עלות לתוצאה" }]
      : []),
    ...(columns.value ? [{ label: "הוספות לעגלה" }] : []),
    { label: "רכישות", compared: true },
    columns.value
      ? { label: "ערך רכישות", compared: true }
      : { label: "עלות לרכישה", compared: true },
    ...(columns.value ? [{ label: "ROAS", compared: true }] : []),
    ...(columns.leads
      ? [
          { label: "לידים", compared: true },
          { label: "עלות לליד", compared: true },
        ]
      : []),
    ...(columns.conversations ? [{ label: "שיחות" }] : []),
  ];
}

/**
 * The total row's result count: null when the campaigns report different
 * kinds of result, which cannot be added up.
 */
export function totalResults(
  campaigns: Array<FacebookReportCampaign>,
): number | null {
  const results = campaigns.map((campaign) => campaign.result);
  const kinds = new Set(results.map((r) => r.result_kind).filter(Boolean));
  if (results.some((r) => r.result_mixed) || kinds.size > 1) {
    return null;
  }
  return results.reduce((sum, r) => sum + r.results, 0);
}
