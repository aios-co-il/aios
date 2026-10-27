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
};

type Props = {
  rows: SharedCampaignRow[];
  entityColumnLabel: string;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
};

/**
 * Traffic campaigns of a shared report. A click is their result, so the table
 * shows CTR and cost per click instead of leads or purchases.
 */
export function SharedTrafficTable({
  rows,
  entityColumnLabel,
  formatCurrency,
  formatNumber,
}: Props) {
  const totals = rows.reduce(
    (sum, row) => ({
      spend: sum.spend + row.spend,
      impressions: sum.impressions + row.impressions,
      clicks: sum.clicks + row.clicks,
    }),
    { spend: 0, impressions: 0, clicks: 0 },
  );
  const cells = (
    row: Pick<SharedCampaignRow, "spend" | "impressions" | "clicks">,
  ) => (
    <>
      <TableCell>{formatCurrency(row.spend)}</TableCell>
      <TableCell>{formatNumber(row.impressions)}</TableCell>
      <TableCell>{formatNumber(row.clicks)}</TableCell>
      <TableCell>{ctr(row.clicks, row.impressions)}</TableCell>
      <TableCell>
        {formatCurrency(row.clicks > 0 ? row.spend / row.clicks : 0)}
      </TableCell>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {row.name}
                  </TableCell>
                  {cells(row)}
                </TableRow>
              ))}
              <TableRow className="bg-primary/10 font-bold border-t-2">
                <TableCell>סה"כ</TableCell>
                {cells(totals)}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Click-through rate as a percentage with two decimals. */
function ctr(clicks: number, impressions: number): string {
  return `${(impressions > 0 ? (clicks / impressions) * 100 : 0).toFixed(2)}%`;
}
