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
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import { GoogleAdsCampaignTotalsRow } from "./GoogleAdsCampaignTotalsRow";
import { CAMPAIGN_GOAL_TITLES } from "@/lib/campaignGoals";
import { ratio } from "@/lib/reportNumber";
import type {
  GoogleAdsCampaignSummaryRow,
  GoogleAdsFormatters,
  GoogleAdsTotals,
  GoogleStoreTotals,
} from "./types";

type Props = GoogleAdsFormatters & {
  rows: GoogleAdsCampaignSummaryRow[];
  goal: GoogleReportGoal;
  groupTotals: GoogleAdsTotals;
  store: GoogleStoreTotals;
  mixed: boolean;
  icon: ReactNode;
  /** Replaces the goal title, as the continents tab names each table by its continent. */
  title?: string;
};

/** Per-campaign table of one goal: sales columns for ecommerce campaigns, conversion columns for lead campaigns. */
export function GoogleAdsCampaignTable({
  rows,
  goal,
  groupTotals,
  store,
  mixed,
  icon,
  title: titleOverride,
  ...formats
}: Props) {
  const { formatCurrency, formatNumber, formatUnitCost } = formats;
  const isEcommerce = goal === "ecommerce";
  const isTraffic = goal === "traffic";
  // A sales campaign that also brought leads (calls, forms) shows them apart.
  const showLeads = isEcommerce && rows.some((row) => (row.leads ?? 0) > 0);
  const title = titleOverride ?? (mixed ? GOAL_TITLES[goal] : SINGLE_TITLE);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        {isTraffic && (
          <p className="text-sm text-muted-foreground">{GOOGLE_TRAFFIC_NOTE}</p>
        )}
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
                {isTraffic ? null : isEcommerce ? (
                  <>
                    <TableHead className="text-right">רכישות</TableHead>
                    <TableHead className="text-right">הכנסות</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead className="text-right">AOV</TableHead>
                    {showLeads && (
                      <TableHead className="text-right">לידים</TableHead>
                    )}
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
                      <CampaignOffBadge off={c.off} />
                      {c.name}
                    </TableCell>
                    <TableCell>{formatNumber(c.impressions)}</TableCell>
                    <TableCell>{formatNumber(c.clicks)}</TableCell>
                    <TableCell>
                      {(ratio(c.clicks, c.impressions) * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell>{cpc > 0 ? formatUnitCost(cpc) : "-"}</TableCell>
                    <TableCell>{formatCurrency(c.spend)}</TableCell>
                    {isTraffic ? null : isEcommerce ? (
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
                        {showLeads && (
                          <TableCell>{formatNumber(c.leads ?? 0)}</TableCell>
                        )}
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
                showLeads={showLeads}
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

const SINGLE_TITLE = "סיכום קמפיינים - Google Ads";

/** Each goal's table title when the report shows more than one goal. */
const GOAL_TITLES: Record<GoogleReportGoal, string> = {
  ecommerce: `${CAMPAIGN_GOAL_TITLES.ecommerce} - Google Ads`,
  leads: `${CAMPAIGN_GOAL_TITLES.leads} - Google Ads`,
  traffic: `${CAMPAIGN_GOAL_TITLES.traffic} - Google Ads`,
};

/** Why an exposure table has no result columns. */
const GOOGLE_TRAFFIC_NOTE =
  "קמפיין שמשלם על חשיפות או קליקים — נמדד בהוצאה, בחשיפות ובקליקים בלבד";

/** Green text for a positive result. */
function good(value: number): string {
  return value > 0 ? "text-green-600 font-medium" : "";
}
