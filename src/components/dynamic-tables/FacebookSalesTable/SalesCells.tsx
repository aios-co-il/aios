import {
  changeMarksFor,
  previousCellsFor,
} from "@/components/reports/PreviousPeriod/previousCells";
import { facebookCostPerResult } from "@/lib/facebookResultMetric";
import { formatReportNumber, resultCellClass } from "@/lib/reportNumber";
import type { FacebookReportCampaign } from "../facebookReportCampaigns";
import { MarkedCell } from "../MarkedCell";
import type { SalesColumns } from "./salesColumns";
import {
  costPerLead,
  costPerPurchase,
  roas,
  summed,
  sumOf,
} from "./salesMetrics";

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

const spendOf = summed("spend");
const purchasesOf = summed("purchases");
const purchaseValueOf = summed("purchase_value");
const leadsOf = summed("leads");

/**
 * Metric cells of one campaign or, given every campaign, of the total row.
 * A compared metric carries its change arrow and colour on the current value.
 */
export function SalesCells({
  campaigns,
  previous,
  columns,
  result,
  currency,
  isTotal,
}: Props) {
  const prev = previousCellsFor(campaigns, previous);
  const mark = changeMarksFor(campaigns, previous);
  const spend = spendOf(campaigns);
  /** An amount in the report's currency. */
  function money(value: number, digits = 0) {
    return `${currency}${formatReportNumber(value, digits)}`;
  }
  /** A result-toned cell's classes. */
  function resultClass(color: string) {
    return resultCellClass(color, isTotal);
  }
  return (
    <>
      <td className="p-2 text-center">
        {formatReportNumber(sumOf(campaigns, "impressions"))}
      </td>
      <td className="p-2 text-center">
        {formatReportNumber(sumOf(campaigns, "clicks"))}
      </td>
      <MarkedCell className="p-2 text-center" mark={mark(spendOf, "neutral")}>
        {money(spend)}
      </MarkedCell>
      {prev(spendOf, money, "neutral")}
      {columns.results && (
        <>
          <td className={resultClass("text-green-600")}>
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
          <td className={resultClass("text-blue-600")}>
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
      <MarkedCell
        className={resultClass("text-green-600")}
        mark={mark(purchasesOf, "higher")}
      >
        {formatReportNumber(purchasesOf(campaigns))}
      </MarkedCell>
      {prev(purchasesOf, formatReportNumber, "higher")}
      {columns.value ? (
        <>
          <MarkedCell
            className="p-2 text-center text-green-600"
            mark={mark(purchaseValueOf, "higher")}
          >
            {money(purchaseValueOf(campaigns))}
          </MarkedCell>
          {prev(purchaseValueOf, money, "higher")}
          <MarkedCell
            className={resultClass("text-blue-600")}
            mark={mark(roas, "higher")}
          >
            {formatReportNumber(roas(campaigns), 1)}x
          </MarkedCell>
          {prev(roas, (value) => `${formatReportNumber(value, 1)}x`, "higher")}
        </>
      ) : (
        <>
          <MarkedCell
            className={resultClass("text-blue-600")}
            mark={mark(costPerPurchase, "lower")}
          >
            {money(costPerPurchase(campaigns), 1)}
          </MarkedCell>
          {prev(costPerPurchase, (value) => money(value, 1), "lower")}
        </>
      )}
      {columns.leads && (
        <>
          <MarkedCell
            className={resultClass("text-green-600")}
            mark={mark(leadsOf, "higher")}
          >
            {formatReportNumber(leadsOf(campaigns))}
          </MarkedCell>
          {prev(leadsOf, formatReportNumber, "higher")}
          <MarkedCell
            className={resultClass("text-blue-600")}
            mark={mark(costPerLead, "lower")}
          >
            {money(costPerLead(campaigns), 1)}
          </MarkedCell>
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
