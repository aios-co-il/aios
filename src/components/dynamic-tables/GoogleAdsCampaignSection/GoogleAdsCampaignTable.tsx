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
import type { GoogleReportCampaignGoal } from "@/lib/googleCampaignGoals";
import { GoogleAdsCampaignTotalsRow } from "./GoogleAdsCampaignTotalsRow";
import { ratio } from "./ratio";
import type {
  GoogleAdsCampaignSummaryRow,
  GoogleAdsFormatters,
  GoogleAdsTotals,
  GoogleStoreTotals,
} from "./types";

type Props = GoogleAdsFormatters & {
  rows: GoogleAdsCampaignSummaryRow[];
  goal: GoogleReportCampaignGoal;
  groupTotals: GoogleAdsTotals;
  store: GoogleStoreTotals;
  mixed: boolean;
  icon: ReactNode;
};

/** Per-campaign table of one goal: sales columns for ecommerce campaigns, conversion columns for lead campaigns. */
export function GoogleAdsCampaignTable({
  rows,
  goal,
  groupTotals,
  store,
  mixed,
  icon,
  ...formats
}: Props) {
  const { formatCurrency, formatNumber, formatUnitCost } = formats;
  const isEcommerce = goal === "ecommerce";
  const title = !mixed
    ? "סיכום קמפיינים - Google Ads"
    : isEcommerce
      ? "קמפייני מכירות - Google Ads"
      : "קמפייני לידים - Google Ads";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">קמפיין</TableHead>
                <TableHead className="text-right">חשיפות</TableHead>
                <TableHead className="text-right">קליקים</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">הוצאה</TableHead>
                {isEcommerce ? (
                  <>
                    <TableHead className="text-right">רכישות</TableHead>
                    <TableHead className="text-right">הכנסות</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead className="text-right">AOV</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="text-right">המרות</TableHead>
                    <TableHead className="text-right">עלות להמרה</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c, i) => {
                const cpc = ratio(c.spend, c.clicks);
                const cpa = ratio(c.spend, c.conversions);
                const roas = ratio(c.conversions_value, c.spend);
                const aov = ratio(c.conversions_value, c.conversions);
                return (
                  <TableRow key={`${c.campaign_id || c.name}-${i}`}>
                    <TableCell className="font-medium max-w-[300px]">
                      {c.name}
                    </TableCell>
                    <TableCell>{formatNumber(c.impressions)}</TableCell>
                    <TableCell>{formatNumber(c.clicks)}</TableCell>
                    <TableCell>
                      {(ratio(c.clicks, c.impressions) * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell>{cpc > 0 ? formatUnitCost(cpc) : "-"}</TableCell>
                    <TableCell>{formatCurrency(c.spend)}</TableCell>
                    {isEcommerce ? (
                      <>
                        <TableCell className={good(c.conversions)}>
                          {formatNumber(c.conversions)}
                        </TableCell>
                        <TableCell className={good(c.conversions_value)}>
                          {formatCurrency(c.conversions_value)}
                        </TableCell>
                        <TableCell>
                          {roas > 0 ? roas.toFixed(2) : "-"}
                        </TableCell>
                        <TableCell>
                          {aov > 0 ? formatCurrency(aov) : "-"}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className={good(c.conversions)}>
                          {formatNumber(c.conversions)}
                        </TableCell>
                        <TableCell>
                          {cpa > 0 ? formatCurrency(cpa) : "-"}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
              <GoogleAdsCampaignTotalsRow
                goal={goal}
                groupTotals={groupTotals}
                store={store}
                {...formats}
              />
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Green text for a positive result. */
function good(value: number): string {
  return value > 0 ? "text-green-600 font-medium" : "";
}
