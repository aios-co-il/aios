import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CAMPAIGN_GOAL_TITLES } from "@/lib/campaignGoals";
import {
  costPerFollower,
  FOLLOWER_COLUMN_LABELS,
  formatFollowerCell,
  showsFollowerColumns,
  sumFacebookFollowers,
  type FacebookFollowerTotals,
} from "@/lib/facebookFollowers";

/** One campaign (or ad set / ad) row of the shared report's campaign tables. */
export type SharedCampaignRow = {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  addToCart: number;
  /** Facebook only; traffic tables show it. */
  followers?: FacebookFollowerTotals;
};

/** What a traffic row needs, so the dashboards pass their campaign rows as-is. */
type TrafficRow = Pick<
  SharedCampaignRow,
  "name" | "spend" | "impressions" | "clicks" | "followers"
>;

type Props = {
  rows: TrafficRow[];
  entityColumnLabel: string;
  formatCurrency: (value: number) => string;
  /**
   * Cost per click and per follower. Both are often under one currency unit,
   * which the whole-unit `formatCurrency` would round to 0.
   */
  formatUnitCost: (value: number) => string;
  formatNumber: (value: number) => string;
  /** Card heading; the shared report's goal title unless a page names its own. */
  title?: ReactNode;
};

/**
 * Traffic campaigns of a shared report or dashboard. A click is their result,
 * so the table shows CTR and cost per click instead of leads or purchases,
 * plus new followers once a campaign sends people to a Page or profile.
 */
export function SharedTrafficTable({
  rows,
  entityColumnLabel,
  formatCurrency,
  formatUnitCost,
  formatNumber,
  title = CAMPAIGN_GOAL_TITLES.traffic,
}: Props) {
  const withFollowers = showsFollowerColumns(rows);
  const cells = (metrics: TrafficMetrics) => (
    <>
      <TableCell>{formatCurrency(metrics.spend)}</TableCell>
      <TableCell>{formatNumber(metrics.impressions)}</TableCell>
      <TableCell>{formatNumber(metrics.clicks)}</TableCell>
      <TableCell>{ctr(metrics.clicks, metrics.impressions)}</TableCell>
      <TableCell>
        {formatUnitCost(
          metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0,
        )}
      </TableCell>
      {withFollowers && (
        <>
          <TableCell>
            {formatFollowerCell(metrics.newFollowers, formatNumber)}
          </TableCell>
          <TableCell>
            {formatFollowerCell(metrics.costPerFollower, formatUnitCost)}
          </TableCell>
        </>
      )}
    </>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">
                  {entityColumnLabel}
                </TableHead>
                <TableHead className="text-right">הוצאה</TableHead>
                <TableHead className="text-right">חשיפות</TableHead>
                <TableHead className="text-right">קליקים</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">עלות לקליק</TableHead>
                {withFollowers && (
                  <>
                    <TableHead className="text-right">
                      {FOLLOWER_COLUMN_LABELS.newFollowers}
                    </TableHead>
                    <TableHead className="text-right">
                      {FOLLOWER_COLUMN_LABELS.costPerFollower}
                    </TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {row.name}
                  </TableCell>
                  {cells(trafficMetrics([row]))}
                </TableRow>
              ))}
              <TableRow className="bg-primary/10 font-bold border-t-2">
                <TableCell>סה"כ</TableCell>
                {cells(trafficMetrics(rows))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

type TrafficMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  newFollowers: number | null;
  costPerFollower: number | null;
};

/** Delivery, spend and followers of one campaign or of the whole table. */
function trafficMetrics(rows: TrafficRow[]): TrafficMetrics {
  const sum = (metric: (row: TrafficRow) => number) =>
    rows.reduce((total, row) => total + metric(row), 0);
  return {
    spend: sum((row) => row.spend),
    impressions: sum((row) => row.impressions),
    clicks: sum((row) => row.clicks),
    newFollowers: sumFacebookFollowers(rows).newFollowers,
    costPerFollower: costPerFollower(rows),
  };
}

/** Click-through rate as a percentage with two decimals. */
function ctr(clicks: number, impressions: number): string {
  return `${(impressions > 0 ? (clicks / impressions) * 100 : 0).toFixed(2)}%`;
}
