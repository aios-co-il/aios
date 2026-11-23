import { TableCell } from "@/components/ui/table";
import {
  formatGoalMoney,
  formatGoalRoas,
  type GoalMoneyPart,
} from "@/lib/dashboardGoalMoney";
import type { GoogleAdsFormatters } from "../GoogleAdsCampaignSection/types";

/**
 * Add-to-cart, purchases, cost per purchase, revenue and ROAS; dashes for a
 * row of another goal. Without `withValue` (purchases that carry no value)
 * the revenue and ROAS cells are left out, as their headers are.
 */
export function SalesCells({
  figures,
  format,
  withValue = true,
  split = null,
}: {
  figures: {
    addToCart: number;
    addToCartTracked: boolean;
    purchases: number;
    /** Null without purchases. */
    costPerPurchase: number | null;
    revenue: number;
    /** Null without spend, or when the purchases carry no value. */
    roas: number | null;
  } | null;
  format: GoogleAdsFormatters;
  withValue?: boolean;
  /**
   * The sales rows per currency, for a total over platforms of different
   * currencies; null when they share one or the total is the store's sales.
   */
  split?: Array<GoalMoneyPart> | null;
}) {
  if (!figures) {
    return <EmptyCells count={withValue ? 5 : 3} />;
  }
  if (split) {
    return (
      <SplitSalesCells
        figures={figures}
        split={split}
        format={format}
        withValue={withValue}
      />
    );
  }
  return (
    <>
      <TableCell>
        {figures.addToCartTracked
          ? format.formatNumber(figures.addToCart)
          : "-"}
      </TableCell>
      <TableCell>{format.formatNumber(figures.purchases)}</TableCell>
      <TableCell>
        {figures.costPerPurchase === null
          ? "-"
          : format.formatCurrency(figures.costPerPurchase)}
      </TableCell>
      {withValue && (
        <>
          <TableCell>{format.formatCurrency(figures.revenue)}</TableCell>
          <TableCell>
            {figures.roas === null ? (
              "-"
            ) : (
              <span
                className={
                  figures.roas >= 1 ? "text-green-600" : "text-red-600"
                }
              >
                {figures.roas.toFixed(2)}
              </span>
            )}
          </TableCell>
        </>
      )}
    </>
  );
}

/**
 * Leads and cost per lead; dashes for a row of another goal. A total over
 * platforms of different currencies (`split`, the lead rows per currency)
 * shows each currency's cost per lead.
 */
export function LeadCells({
  figures,
  format,
  split = null,
}: {
  figures: { leads: number; cpl: number } | null;
  format: GoogleAdsFormatters;
  split?: Array<GoalMoneyPart> | null;
}) {
  if (!figures) {
    return <EmptyCells count={2} />;
  }
  return (
    <>
      <TableCell>{format.formatNumber(figures.leads)}</TableCell>
      <TableCell>
        {split
          ? formatGoalMoney(split, (m) => m.spend, { count: (m) => m.leads })
          : figures.cpl > 0
            ? format.formatCurrency(figures.cpl)
            : "-"}
      </TableCell>
    </>
  );
}

/** Dashes for the columns a row's goal is not measured on. */
function EmptyCells({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <TableCell key={index}>-</TableCell>
      ))}
    </>
  );
}

/** The sales cells of a total whose campaigns spent in several currencies. */
function SplitSalesCells({
  figures,
  split,
  format,
  withValue,
}: {
  figures: { addToCart: number; addToCartTracked: boolean; purchases: number };
  split: Array<GoalMoneyPart>;
  format: GoogleAdsFormatters;
  withValue: boolean;
}) {
  return (
    <>
      <TableCell>
        {figures.addToCartTracked
          ? format.formatNumber(figures.addToCart)
          : "-"}
      </TableCell>
      <TableCell>{format.formatNumber(figures.purchases)}</TableCell>
      <TableCell>
        {formatGoalMoney(split, (m) => m.spend, { count: (m) => m.purchases })}
      </TableCell>
      {withValue && (
        <>
          <TableCell>{formatGoalMoney(split, (m) => m.revenue)}</TableCell>
          <TableCell>{formatGoalRoas(split)}</TableCell>
        </>
      )}
    </>
  );
}
