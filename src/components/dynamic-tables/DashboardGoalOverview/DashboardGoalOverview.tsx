import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CAMPAIGN_GOAL_TITLES } from "@/lib/campaignGoals";
import type { DashboardCombinedSales } from "@/lib/dashboardCombinedFigures";
import type { DashboardGoalSummary } from "@/lib/dashboardGoalSummary";
import type { GoogleAdsFormatters } from "../GoogleAdsCampaignSection/types";
import type { PlatformLabelOf } from "../DashboardPlatformBreakdown/BreakdownCells";
import { CombinedRoasCard } from "../CombinedRoasCard";
import { goalPanels, type GoalFigure } from "./goalPanels";

type Props = {
  summary: DashboardGoalSummary;
  /** Combined sales (combinedDashboardSales). */
  sales: DashboardCombinedSales;
  /** Combined leads (combinedDashboardLeads). */
  leads: { leads: number; cpl: number };
  /** The page's delivery totals, as its single-goal cards show them. */
  delivery: { spend: number; impressions: number; clicks: number };
  platformLabel: PlatformLabelOf;
  format: GoogleAdsFormatters;
};

/**
 * The "All" tab's summary for a dashboard with campaigns of several goals:
 * one row of what every goal shares (spend, impressions, clicks) plus the
 * sales campaigns' ROAS when there are any, then a panel per goal with only what that goal is measured on, so a lead or
 * traffic campaign never shows a ROAS and goals are never averaged together.
 */
export function DashboardGoalOverview({
  summary,
  sales,
  leads,
  delivery,
  platformLabel,
  format,
}: Props) {
  const deliveryFigures: GoalFigure[] = [
    { label: "הוצאה כוללת", value: format.formatCurrency(delivery.spend) },
    { label: "סה״כ חשיפות", value: format.formatNumber(delivery.impressions) },
    { label: "סה״כ קליקים", value: format.formatNumber(delivery.clicks) },
  ];
  const hasSales = summary.rows.some((row) => row.goal === "ecommerce");
  return (
    <div className="space-y-3">
      <div
        className={`grid gap-3 grid-cols-1 ${hasSales ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}
      >
        {deliveryFigures.map((figure) => (
          <Card
            key={figure.label}
            className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900"
          >
            <CardContent className="p-5 text-center">
              <p className="text-sm text-muted-foreground">{figure.label}</p>
              <p className="text-3xl font-bold mt-2">{figure.value}</p>
            </CardContent>
          </Card>
        ))}
        {/* ROAS stays on top as on a single-goal dashboard; it is the sales
            campaigns' own, never spread over lead or traffic spend. */}
        {hasSales && (
          <CombinedRoasCard
            sales={sales}
            formatCurrency={format.formatCurrency}
          />
        )}
      </div>
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
        {goalPanels({ summary, sales, leads, platformLabel, format }).map(
          (panel) => (
            <Card key={panel.goal}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {CAMPAIGN_GOAL_TITLES[panel.goal]}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {panel.figures.map((figure) => (
                    <div key={figure.label}>
                      <p className="text-xs text-muted-foreground">
                        {figure.label}
                      </p>
                      <p className="text-xl font-bold mt-1">{figure.value}</p>
                    </div>
                  ))}
                </div>
                {panel.note && (
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    {panel.note}
                  </p>
                )}
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
