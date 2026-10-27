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

type Props = {
  rows: SharedCampaignRow[];
  entityColumnLabel: string;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
};

/**
 * Traffic campaigns of a shared report. A click is their result, so the table
 * shows CTR and cost per click instead of leads or purchases, plus new
 * followers once a campaign sends people to a Page or profile.
 */
export function SharedTrafficTable({
  rows,
  entityColumnLabel,
  formatCurrency,
  formatNumber,
}: Props) {
  const withFollowers = showsFollowerColumns(rows);
  const cells = (metrics: TrafficMetrics) => (
    <>
      <TableCell>{formatCurrency(metrics.spend)}</TableCell>
      <TableCell>{formatNumber(metrics.impressions)}</TableCell>
      <TableCell>{formatNumber(metrics.clicks)}</TableCell>
      <TableCell>{ctr(metrics.clicks, metrics.impressions)}</TableCell>
      <TableCell>
        {formatCurrency(
          metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0,
        )}
      </TableCell>
      {withFollowers && (
        <>
          <TableCell>{formatNumber(metrics.newFollowers)}</TableCell>
          <TableCell>
            {metrics.costPerFollower === null
              ? "—"
              : formatCurrency(metrics.costPerFollower)}
          </TableCell>
        </>
      )}
    </>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{CAMPAIGN_GOAL_TITLES.traffic}</CardTitle>
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
  newFollowers: number;
  costPerFollower: number | null;
};

/** Delivery, spend and followers of one campaign or of the whole table. */
function trafficMetrics(rows: SharedCampaignRow[]): TrafficMetrics {
  const sum = (metric: (row: SharedCampaignRow) => number) =>
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
