import { MarkedCell } from "@/components/reports/PreviousPeriod/MarkedCell";
import { compareCellsFor } from "@/components/reports/PreviousPeriod/previousCells";
import { facebookCostPerResult } from "@/lib/facebookResultMetric";
import { formatReportNumber, resultCellClass } from "@/lib/reportNumber";
import {
  costPerLead,
  leadsOf,
  spendOf,
  sumOf,
  summed,
} from "../facebookMetrics";
import type { FacebookReportCampaign } from "../facebookReportCampaigns";
import type { SalesColumns } from "./salesColumns";
import { costPerPurchase, roas } from "./salesMetrics";

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

const purchasesOf = summed("purchases");
const purchaseValueOf = summed("purchase_value");

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
  const compared = compareCellsFor(campaigns, previous);
  const spend = compared(spendOf, money, "neutral");
  const purchases = compared(purchasesOf, formatReportNumber, "higher");
  const value = compared(purchaseValueOf, money, "higher");
  const roasMetric = compared(roas, times, "higher");
  const cpp = compared(costPerPurchase, (cost) => money(cost, 1), "lower");
  const leads = compared(leadsOf, formatReportNumber, "higher");
  const cpl = compared(costPerLead, (cost) => money(cost, 1), "lower");
  const green = resultCellClass("text-green-600", isTotal);
  const blue = resultCellClass("text-blue-600", isTotal);
  /** An amount in the report's currency. */
  function money(amount: number, digits = 0) {
    return `${currency}${formatReportNumber(amount, digits)}`;
  }
  return (
    <>
      <td className="p-2 text-center">
        {formatReportNumber(sumOf(campaigns, "impressions"))}
      </td>
      <td className="p-2 text-center">
        {formatReportNumber(sumOf(campaigns, "clicks"))}
      </td>
      <MarkedCell className="p-2 text-center" mark={spend.mark}>
        {money(spendOf(campaigns))}
      </MarkedCell>
      {spend.previousCell}
      {columns.results && (
        <>
          <td className={green}>
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
          <td className={blue}>
            {result.count
              ? money(
                  facebookCostPerResult(spendOf(campaigns), result.count),
                  1,
                )
              : "—"}
          </td>
        </>
      )}
      {columns.value && (
        <td className="p-2 text-center text-orange-600">
          {formatReportNumber(sumOf(campaigns, "add_to_cart"))}
        </td>
      )}
      <MarkedCell className={green} mark={purchases.mark}>
        {formatReportNumber(purchasesOf(campaigns))}
      </MarkedCell>
      {purchases.previousCell}
      {columns.value ? (
        <>
          <MarkedCell
            className="p-2 text-center text-green-600"
            mark={value.mark}
          >
            {money(purchaseValueOf(campaigns))}
          </MarkedCell>
          {value.previousCell}
          <MarkedCell className={blue} mark={roasMetric.mark}>
            {times(roas(campaigns) ?? 0)}
          </MarkedCell>
          {roasMetric.previousCell}
        </>
      ) : (
        <>
          <MarkedCell className={blue} mark={cpp.mark}>
            {money(costPerPurchase(campaigns) ?? 0, 1)}
          </MarkedCell>
          {cpp.previousCell}
        </>
      )}
      {columns.leads && (
        <>
          <MarkedCell className={green} mark={leads.mark}>
            {formatReportNumber(leadsOf(campaigns))}
          </MarkedCell>
          {leads.previousCell}
          <MarkedCell className={blue} mark={cpl.mark}>
            {money(costPerLead(campaigns) ?? 0, 1)}
          </MarkedCell>
          {cpl.previousCell}
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

/** A return on ad spend, as a multiple. */
function times(value: number): string {
  return `${formatReportNumber(value, 1)}x`;
}
