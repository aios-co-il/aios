import type { ReactNode } from "react";
import { TableCell } from "@/components/ui/table";
import { CAMPAIGN_GOAL_TITLES } from "@/lib/campaignGoals";
import type {
  DashboardAdsPlatform,
  DashboardGoalRow,
} from "@/lib/dashboardGoalSummary";
import type { GoogleAdsFormatters } from "../GoogleAdsCampaignSection/types";

/** A platform's name, text color and icon, as the dashboard page draws them. */
export type PlatformLabelOf = (platform: DashboardAdsPlatform) => {
  name: string;
  color: string;
  icon: ReactNode;
};

/** The platform's icon and name with the goal of the row's campaigns. */
export function GoalRowLabel({
  row,
  platformLabel,
}: {
  row: DashboardGoalRow;
  platformLabel: PlatformLabelOf;
}) {
  const platform = platformLabel(row.platform);
  return (
    <div className="flex items-center gap-2">
      {platform.icon}
      <span className={platform.color}>
        {platform.name} - {CAMPAIGN_GOAL_TITLES[row.goal]}
      </span>
    </div>
  );
}

/** Spend, impressions, clicks and cost per click: every goal has them. */
export function DeliveryCells({
  metrics,
  format,
}: {
  metrics: { spend: number; impressions: number; clicks: number };
  format: GoogleAdsFormatters;
}) {
  return (
    <>
      <TableCell>{format.formatCurrency(metrics.spend)}</TableCell>
      <TableCell>{format.formatNumber(metrics.impressions)}</TableCell>
      <TableCell>{format.formatNumber(metrics.clicks)}</TableCell>
      <TableCell>
        {metrics.clicks > 0
          ? format.formatUnitCost(metrics.spend / metrics.clicks)
          : "-"}
      </TableCell>
    </>
  );
}

/**
 * Add-to-cart, purchases, cost per purchase, revenue and ROAS; dashes for a
 * row of another goal. Without `withValue` (purchases that carry no value)
 * the revenue and ROAS cells are left out, as their headers are.
 */
export function SalesCells({
  figures,
  format,
  withValue = true,
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
}) {
  if (!figures) {
    return <EmptyCells count={withValue ? 5 : 3} />;
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

/** Leads and cost per lead; dashes for a row of another goal. */
export function LeadCells({
  figures,
  format,
}: {
  figures: { leads: number; cpl: number } | null;
  format: GoogleAdsFormatters;
}) {
  if (!figures) {
    return <EmptyCells count={2} />;
  }
  return (
    <>
      <TableCell>{format.formatNumber(figures.leads)}</TableCell>
      <TableCell>
        {figures.cpl > 0 ? format.formatCurrency(figures.cpl) : "-"}
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
