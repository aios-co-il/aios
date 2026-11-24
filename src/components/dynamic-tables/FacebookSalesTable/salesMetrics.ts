import { ratio } from "@/lib/reportNumber";
import type { FacebookReportCampaign } from "../facebookReportCampaigns";

type Rows = Array<FacebookReportCampaign>;

/** A numeric column of the sales table, summed over its rows. */
type SummedKey =
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

/** Purchase value per unit of spend. */
export function roas(rows: Rows): number {
  return ratio(sumOf(rows, "purchase_value"), sumOf(rows, "spend"));
}

/** Spend per purchase. */
export function costPerPurchase(rows: Rows): number {
  return ratio(sumOf(rows, "spend"), sumOf(rows, "purchases"));
}

/** Spend per lead. */
export function costPerLead(rows: Rows): number {
  return ratio(sumOf(rows, "spend"), sumOf(rows, "leads"));
}
