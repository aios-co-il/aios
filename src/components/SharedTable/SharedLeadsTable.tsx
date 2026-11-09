import type { ReactNode } from "react";
import { CampaignOffBadge } from "@/components/reports/CampaignOffBadge";
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
  showsFollowerColumns,
  sumFacebookFollowers,
} from "@/lib/facebookFollowers";
import { FollowerCells, FollowerHeads } from "./FollowerColumns";
import type { SharedCampaignRow } from "./sharedCampaignTables";

/** What a leads row needs, so the dashboards pass their campaign rows as-is. */
type LeadsRow = Pick<
  SharedCampaignRow,
  "name" | "spend" | "impressions" | "clicks" | "leads" | "followers"
> &
  Partial<Pick<SharedCampaignRow, "off">>;

type Props = {
  rows: Array<LeadsRow>;
  entityColumnLabel: string;
  formatCurrency: (value: number) => string;
  formatUnitCost: (value: number) => string;
  formatNumber: (value: number) => string;
  /** Google Ads counts conversions rather than leads. */
  results?: keyof typeof RESULT_LABELS;
  /** Card heading; the shared report's goal title unless a page names its own. */
  title?: ReactNode;
};

const RESULT_LABELS = {
  leads: { results: "לידים", costPerResult: "עלות לליד" },
  conversions: { results: "המרות", costPerResult: "עלות להמרה" },
};

/**
 * Lead campaigns of a shared report or dashboard. A campaign that sends people
 * to an Instagram or Facebook profile can count as leads (AIO-514) and still
 * gain followers, so the follower columns show once one such campaign is in.
 */
export function SharedLeadsTable({
  rows,
  entityColumnLabel,
  formatCurrency,
  formatUnitCost,
  formatNumber,
  results = "leads",
  title = CAMPAIGN_GOAL_TITLES.leads,
}: Props) {
  const withFollowers = showsFollowerColumns(rows);
  const resultLabels = RESULT_LABELS[results];
  function cells(metrics: LeadsMetrics) {
    return (
      <>
        <TableCell>{formatCurrency(metrics.spend)}</TableCell>
        <TableCell>{formatNumber(metrics.impressions)}</TableCell>
        <TableCell>{formatNumber(metrics.clicks)}</TableCell>
        <TableCell className={metrics.leads > 0 ? "text-green-600" : ""}>
          {formatNumber(metrics.leads)}
        </TableCell>
        <TableCell>
          {metrics.leads > 0
            ? formatCurrency(metrics.spend / metrics.leads)
            : "—"}
        </TableCell>
        {withFollowers && (
          <FollowerCells
            newFollowers={metrics.newFollowers}
            costPerFollower={metrics.costPerFollower}
            formatNumber={formatNumber}
            formatUnitCost={formatUnitCost}
          />
        )}
      </>
    );
  }

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
                <TableHead className="text-right">
                  {resultLabels.results}
                </TableHead>
                <TableHead className="text-right">
                  {resultLabels.costPerResult}
                </TableHead>
                {withFollowers && <FollowerHeads />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    <CampaignOffBadge off={row.off === true} />
                    {row.name}
                  </TableCell>
                  {cells(leadsMetrics([row]))}
                </TableRow>
              ))}
              <TableRow className="bg-primary/10 font-bold border-t-2">
                <TableCell>סה"כ</TableCell>
                {cells(leadsMetrics(rows))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

type LeadsMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  newFollowers: number | null;
  costPerFollower: number | null;
};

/** Delivery, spend, leads and followers of one campaign or the whole table. */
function leadsMetrics(rows: Array<LeadsRow>): LeadsMetrics {
  function sum(metric: (row: LeadsRow) => number) {
    return rows.reduce((total, row) => total + metric(row), 0);
  }
  return {
    spend: sum((row) => row.spend),
    impressions: sum((row) => row.impressions),
    clicks: sum((row) => row.clicks),
    leads: sum((row) => row.leads),
    newFollowers: sumFacebookFollowers(rows).newFollowers,
    costPerFollower: costPerFollower(rows),
  };
}
