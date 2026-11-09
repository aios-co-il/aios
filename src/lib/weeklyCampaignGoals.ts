import { isFacebookLeadsOnlyTable } from "@/lib/adsMetrics";
import {
  groupRowsByCampaignGoal,
  type ReportCampaignGoal,
} from "@/lib/campaignGoals";
import { costPerFollower, sumFacebookFollowers } from "@/lib/facebookFollowers";
import { googleReportFallbackGoal } from "@/lib/googleGoalPresence";
import { isEcommerceReportTable } from "@/lib/pulseCampaignGoals";
import { weeklyRoas } from "@/lib/weeklyAdsRevenue";
import type {
  WeeklyCampaignRow,
  WeeklySourceModes,
} from "@/lib/weeklyAdsComparison";

export type WeeklyGoalTotals = Omit<
  WeeklyCampaignRow,
  "key" | "source" | "campaignId" | "campaign" | "kind" | "off"
>;

/** One goal's campaigns in a week, with totals of that goal only. */
export type WeeklyGoalGroup = {
  kind: ReportCampaignGoal;
  rows: WeeklyCampaignRow[];
  totals: WeeklyGoalTotals;
};

/**
 * A week's campaigns by goal in report order (sales, leads, traffic), each
 * with its own totals. Goals without campaigns are left out.
 */
export function groupWeeklyRowsByGoal(
  rows: WeeklyCampaignRow[],
): WeeklyGoalGroup[] {
  return groupRowsByCampaignGoal(rows, (row) => row.kind).map((group) => ({
    kind: group.goal,
    rows: group.rows,
    totals: goalTotals(group.rows),
  }));
}

/**
 * The report table's goal settings for the weekly tab, same as its main tables:
 * Facebook Insights is leads-only only when set to leads (otherwise each campaign
 * by its own goal), and Google falls back to the table's type for unknown goals.
 */
export function weeklySourceModesForTable(
  integrationSettings?: Record<string, unknown> | null,
  category?: string | null,
): WeeklySourceModes {
  // Google's fallback reads the "איקומרס" category too, as the report does (AIO-494).
  const googleSales = isEcommerceReportTable({
    integration_settings: integrationSettings,
    category,
  });
  return {
    facebook_insights: isFacebookLeadsOnlyTable(integrationSettings)
      ? "leads"
      : undefined,
    facebook_ecommerce: "ecommerce",
    google_ads: googleSales ? "ecommerce" : "leads",
  };
}

/**
 * A dashboard's goal settings for the weekly tab, over all of its report
 * tables: as weeklySourceModesForTable for one table. Facebook Insights is
 * leads-only when a Facebook Insights table is set to leads, and Google falls
 * back to the reports' goal for its rows no rule can key.
 */
export function weeklySourceModesForTables(
  tables: Array<{
    integration_type?: string | null;
    integration_settings?: Record<string, unknown> | null;
  }>,
): WeeklySourceModes {
  const leadsOnly = tables.some(
    (table) =>
      table.integration_type === "facebook_insights" &&
      isFacebookLeadsOnlyTable(table.integration_settings),
  );
  return {
    facebook_insights: leadsOnly ? "leads" : undefined,
    facebook_ecommerce: "ecommerce",
    google_ads: googleReportFallbackGoal(tables),
  };
}

/**
 * Totals of one goal: its own results, cost per result, (sales only) ROAS and
 * the followers its campaigns gained.
 */
function goalTotals(rows: WeeklyCampaignRow[]): WeeklyGoalTotals {
  const totals = rows.reduce(
    (sum, row) => {
      sum.impressions += row.impressions;
      sum.clicks += row.clicks;
      sum.results += row.results;
      sum.leads += row.leads;
      sum.spend += row.spend;
      sum.revenue += row.revenue;
      sum.addToCart += row.addToCart;
      return sum;
    },
    {
      impressions: 0,
      clicks: 0,
      results: 0,
      leads: 0,
      spend: 0,
      costPerResult: 0,
      revenue: 0,
      addToCart: 0,
      roas: 0,
    },
  );
  totals.costPerResult = totals.results > 0 ? totals.spend / totals.results : 0;
  totals.roas = weeklyRoas(rows, totals.revenue);
  return {
    ...totals,
    followers: sumFacebookFollowers(rows),
    costPerFollower: costPerFollower(rows),
  };
}
