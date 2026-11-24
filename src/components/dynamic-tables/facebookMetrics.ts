import type { FacebookReportCampaign } from "./facebookReportCampaigns";

type Rows = Array<FacebookReportCampaign>;

/** A numeric column of the Facebook report tables, summed over their rows. */
export type SummedKey =
  | "impressions"
  | "clicks"
  | "spend"
  | "purchases"
  | "purchase_value"
  | "add_to_cart"
  | "leads"
  | "conversations";

/** One number summed over the rows. */
export function sumOf(rows: Rows, key: SummedKey): number {
  return rows.reduce((total, row) => total + row[key], 0);
}

/** A reader of one summed column, for the previous-period comparison. */
export function summed(key: SummedKey): (rows: Rows) => number {
  return (rows) => sumOf(rows, key);
}

/**
 * A reader of one summed column per unit of another, such as spend per lead.
 * It reads null when the rows have none of the unit, so the comparison marks
 * nothing and a period without any shows a dash.
 */
export function perUnit(
  amount: SummedKey,
  unit: SummedKey,
): (rows: Rows) => number | null {
  return (rows) => {
    const units = sumOf(rows, unit);
    return units > 0 ? sumOf(rows, amount) / units : null;
  };
}

/** Spend summed over the rows. */
export const spendOf = summed("spend");

/** Leads summed over the rows. */
export const leadsOf = summed("leads");

/** Spend per lead; null without leads. */
export const costPerLead = perUnit("spend", "leads");
