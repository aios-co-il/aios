import type { ReactNode } from "react";
import { TableCell } from "@/components/ui/table";
import { CAMPAIGN_GOAL_TITLES } from "@/lib/campaignGoals";
import type {
  DashboardAdsPlatform,
  DashboardGoalRow,
} from "@/lib/dashboardGoalSummary";
import { formatGoalMoney, type GoalMoneyPart } from "@/lib/dashboardGoalMoney";
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

/**
 * Spend, impressions, clicks and cost per click: every goal has them. A total
 * over platforms of different currencies (`split`) shows its amounts per
 * currency.
 */
export function DeliveryCells({
  metrics,
  format,
  split = null,
}: {
  metrics: { spend: number; impressions: number; clicks: number };
  format: GoogleAdsFormatters;
  split?: Array<GoalMoneyPart> | null;
}) {
  return (
    <>
      <TableCell>
        {split
          ? formatGoalMoney(split, (m) => m.spend)
          : format.formatCurrency(metrics.spend)}
      </TableCell>
      <TableCell>{format.formatNumber(metrics.impressions)}</TableCell>
      <TableCell>{format.formatNumber(metrics.clicks)}</TableCell>
      <TableCell>
        {split
          ? formatGoalMoney(split, (m) => m.spend, {
              count: (m) => m.clicks,
              unitCost: true,
            })
          : metrics.clicks > 0
            ? format.formatUnitCost(metrics.spend / metrics.clicks)
            : "-"}
      </TableCell>
    </>
  );
}
