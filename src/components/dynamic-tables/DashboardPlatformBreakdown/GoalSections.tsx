import { Fragment } from "react";
import {
  CAMPAIGN_GOAL_TITLES,
  CAMPAIGN_GOAL_TOTAL_LABELS,
  groupRowsByCampaignGoal,
} from "@/lib/campaignGoals";
import { TableCell, TableRow } from "@/components/ui/table";
import { purchaseValueUnreported } from "@/lib/dashboardCombinedFigures";
import { goalMoneyParts } from "@/lib/dashboardGoalMoney";
import {
  leadSplit,
  REVENUE_SOURCE_LABELS,
  rowFormat,
  totalSales,
  type BreakdownProps,
} from "./breakdownFigures";
import { DeliveryCells } from "./BreakdownCells";
import { LeadCells, SalesCells } from "./GoalResultCells";
import { PlatformRow } from "./MixedRows";

/**
 * Each goal under its own heading with a subtotal of only what that goal is
 * measured on, then a total of what every goal shares: a dashboard with
 * campaigns of several goals.
 */
export function GoalSections({
  summary,
  sales,
  leads,
  revenueSource,
  platformLabel,
  format,
  currencies,
  columnCount,
}: BreakdownProps & { columnCount: number }) {
  const showSales = summary.hasEcommerce;
  const showLeads = summary.hasLeads;
  const total = totalSales(summary, sales, revenueSource, currencies);
  return (
    <>
      {groupRowsByCampaignGoal(summary.rows, (row) => row.goal).map(
        ({ goal, rows }) => (
          <Fragment key={goal}>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableCell colSpan={columnCount} className="font-semibold">
                {CAMPAIGN_GOAL_TITLES[goal]}
              </TableCell>
            </TableRow>
            {rows.map((row) => (
              <PlatformRow
                key={row.key}
                row={row}
                summary={summary}
                sales={sales}
                platformLabel={platformLabel}
                format={rowFormat(row, format, currencies)}
              />
            ))}
            <TableRow className="font-semibold border-b-2">
              <TableCell>
                {CAMPAIGN_GOAL_TOTAL_LABELS[goal]}
                {goal === "ecommerce" && revenueSource && (
                  <span className="text-xs font-normal text-muted-foreground block">
                    {REVENUE_SOURCE_LABELS[revenueSource]} / הוצאות פרסום ללא
                    קמפייני לידים
                  </span>
                )}
              </TableCell>
              <DeliveryCells
                metrics={summary.goals[goal]}
                format={format}
                split={goalMoneyParts(rows, currencies)}
              />
              {showSales && (
                <SalesCells
                  withValue={!purchaseValueUnreported(sales)}
                  figures={goal === "ecommerce" ? total.figures : null}
                  split={total.split}
                  format={format}
                />
              )}
              {showLeads && (
                <LeadCells
                  figures={goal === "leads" ? leads : null}
                  format={format}
                  split={leadSplit(rows, currencies)}
                />
              )}
            </TableRow>
          </Fragment>
        ),
      )}
      <TableRow className="bg-muted/50 font-bold border-t-2">
        <TableCell>סה"כ כל הקמפיינים</TableCell>
        <DeliveryCells
          metrics={summary.total}
          format={format}
          split={goalMoneyParts(summary.rows, currencies)}
        />
        {showSales && (
          <SalesCells
            withValue={!purchaseValueUnreported(sales)}
            figures={null}
            format={format}
          />
        )}
        {showLeads && <LeadCells figures={null} format={format} />}
      </TableRow>
    </>
  );
}
