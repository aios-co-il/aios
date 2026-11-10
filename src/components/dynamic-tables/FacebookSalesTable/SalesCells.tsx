import { previousCellsFor } from "@/components/reports/PreviousPeriod/previousCells";
import { facebookCostPerResult } from "@/lib/facebookResultMetric";
import { formatReportNumber, ratio, resultCellClass } from "@/lib/reportNumber";
import type { FacebookReportCampaign } from "../facebookReportCampaigns";
import type { SalesColumns } from "./salesColumns";

type Rows = Array<FacebookReportCampaign>;

type Props = {
  campaigns: Rows;
  /** Null when the entity did not run then; undefined with comparison off. */
  previous: Rows | null | undefined;
  columns: SalesColumns;
  /** The row's Meta result: its count (null when it cannot be added up) and label. */
  result: { count: number | null; label: string | null };
  currency: string;
  isTotal: boolean;
};

/** Metric cells of one campaign or, given every campaign, of the total row. */
export function SalesCells({
  campaigns,
  previous,
  columns,
  result,
  currency,
  isTotal,
}: Props) {
  const prev = previousCellsFor(campaigns, previous);
  const spend = sumOf(campaigns, "spend");
  /** An amount in the report's currency. */
  function money(value: number, digits = 0) {
    return `${currency}${formatReportNumber(value, digits)}`;
  }
  return (
    <>
      <td className="p-2 text-center">
        {formatReportNumber(sumOf(campaigns, "impressions"))}
      </td>
      <td className="p-2 text-center">
        {formatReportNumber(sumOf(campaigns, "clicks"))}
      </td>
      <td className="p-2 text-center">{money(spend)}</td>
      {prev((rows) => sumOf(rows, "spend"), money, "neutral")}
      {columns.results && (
        <>
          <td className={resultCellClass("text-green-600", isTotal)}>
            {result.count === null ? (
              "—"
            ) : (
              <>
                {formatReportNumber(result.count)}
                {columns.resultLabelInCell && result.label && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {result.label}
                  </span>
                )}
              </>
            )}
          </td>
          <td className={resultCellClass("text-blue-600", isTotal)}>
            {result.count
              ? money(facebookCostPerResult(spend, result.count), 1)
              : "—"}
          </td>
        </>
      )}
      {columns.value && (
        <td className="p-2 text-center text-orange-600">
          {formatReportNumber(sumOf(campaigns, "add_to_cart"))}
        </td>
      )}
      <td className={resultCellClass("text-green-600", isTotal)}>
        {formatReportNumber(sumOf(campaigns, "purchases"))}
      </td>
      {prev((rows) => sumOf(rows, "purchases"), formatReportNumber, "higher")}
      {columns.value ? (
        <>
          <td className="p-2 text-center text-green-600">
            {money(sumOf(campaigns, "purchase_value"))}
          </td>
          {prev((rows) => sumOf(rows, "purchase_value"), money, "higher")}
          <td className={resultCellClass("text-blue-600", isTotal)}>
            {formatReportNumber(roas(campaigns), 1)}x
          </td>
          {prev(roas, (value) => `${formatReportNumber(value, 1)}x`, "higher")}
        </>
      ) : (
        <>
          <td className={resultCellClass("text-blue-600", isTotal)}>
            {money(costPerPurchase(campaigns), 1)}
          </td>
          {prev(costPerPurchase, (value) => money(value, 1), "lower")}
        </>
      )}
      {columns.leads && (
        <>
          <td className={resultCellClass("text-green-600", isTotal)}>
            {formatReportNumber(sumOf(campaigns, "leads"))}
          </td>
          {prev((rows) => sumOf(rows, "leads"), formatReportNumber, "higher")}
          <td className={resultCellClass("text-blue-600", isTotal)}>
            {money(costPerLead(campaigns), 1)}
          </td>
          {prev(costPerLead, (value) => money(value, 1), "lower")}
        </>
      )}
      {columns.conversations && (
        <td className="p-2 text-center">
          {formatReportNumber(sumOf(campaigns, "conversations"))}
        </td>
      )}
    </>
  );
}

/** Purchase value per unit of spend. */
function roas(rows: Rows): number {
  return ratio(sumOf(rows, "purchase_value"), sumOf(rows, "spend"));
}

/** Spend per purchase. */
function costPerPurchase(rows: Rows): number {
  return ratio(sumOf(rows, "spend"), sumOf(rows, "purchases"));
}

/** Spend per lead. */
function costPerLead(rows: Rows): number {
  return ratio(sumOf(rows, "spend"), sumOf(rows, "leads"));
}

/** One number summed over the rows. */
function sumOf(
  rows: Rows,
  key:
    | "impressions"
    | "clicks"
    | "spend"
    | "purchases"
    | "purchase_value"
    | "add_to_cart"
    | "leads"
    | "conversations",
): number {
  return rows.reduce((total, row) => total + row[key], 0);
}
