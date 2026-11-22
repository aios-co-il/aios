import { TableCell, TableRow } from "@/components/ui/table";
import { purchaseValueUnreported } from "@/lib/dashboardCombinedFigures";
import { goalMoneyParts } from "@/lib/dashboardGoalMoney";
import {
  leadSplit,
  REVENUE_SOURCE_LABELS,
  rowFormat,
  rowLeads,
  rowSales,
  totalSales,
  type BreakdownProps,
} from "./breakdownFigures";
import { DeliveryCells, GoalRowLabel } from "./BreakdownCells";
import { LeadCells, SalesCells } from "./GoalResultCells";
import type { DashboardCombinedSales } from "@/lib/dashboardCombinedFigures";
import type {
  DashboardGoalRow,
  DashboardGoalSummary,
} from "@/lib/dashboardGoalSummary";
import type { GoogleAdsFormatters } from "../GoogleAdsCampaignSection/types";
import type { PlatformLabelOf } from "./BreakdownCells";

/** One row per platform and goal, then one total row: a single-goal dashboard. */
export function MixedRows({
  summary,
  sales,
  leads,
  revenueSource,
  platformLabel,
  format,
  currencies,
}: BreakdownProps) {
  const showSales = summary.hasEcommerce;
  const showLeads = summary.hasLeads;
  const total = totalSales(summary, sales, revenueSource, currencies);
  return (
    <>
      {summary.rows.map((row) => (
        <PlatformRow
          key={row.key}
          row={row}
          summary={summary}
          sales={sales}
          platformLabel={platformLabel}
          format={rowFormat(row, format, currencies)}
        />
      ))}
      <TableRow className="bg-muted/50 font-bold border-t-2">
        <TableCell>
          סה"כ
          {showSales && revenueSource && (
            <span className="text-xs font-normal text-muted-foreground block">
              {REVENUE_SOURCE_LABELS[revenueSource]} / הוצאות פרסום ללא קמפייני
              לידים
            </span>
          )}
        </TableCell>
        <DeliveryCells
          metrics={summary.total}
          format={format}
          split={goalMoneyParts(summary.rows, currencies)}
        />
        {showSales && (
          <SalesCells
            withValue={!purchaseValueUnreported(sales)}
            figures={total.figures}
            split={total.split}
            format={format}
          />
        )}
        {showLeads && (
          <LeadCells
            figures={leads}
            format={format}
            split={leadSplit(summary.rows, currencies)}
          />
        )}
      </TableRow>
    </>
  );
}

/**
 * One platform's campaigns of one goal, in that platform's currency
 * (rowFormat); each fills only its own goal's columns.
 */
export function PlatformRow({
  row,
  summary,
  sales,
  platformLabel,
  format,
}: {
  row: DashboardGoalRow;
  summary: DashboardGoalSummary;
  sales: DashboardCombinedSales;
  platformLabel: PlatformLabelOf;
  format: GoogleAdsFormatters;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <GoalRowLabel row={row} platformLabel={platformLabel} />
      </TableCell>
      <DeliveryCells metrics={row.metrics} format={format} />
      {summary.hasEcommerce && (
        <SalesCells
          withValue={!purchaseValueUnreported(sales)}
          figures={rowSales(row)}
          format={format}
        />
      )}
      {summary.hasLeads && (
        <LeadCells figures={rowLeads(row)} format={format} />
      )}
    </TableRow>
  );
}
