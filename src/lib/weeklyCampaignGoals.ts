import { isFacebookLeadsOnlyTable } from "@/lib/adsMetrics";
import { costPerFollower, sumFacebookFollowers } from "@/lib/facebookFollowers";
import { weeklyRoas } from "@/lib/weeklyAdsRevenue";
import type {
  WeeklyCampaignKind,
  WeeklyCampaignRow,
  WeeklySourceModes,
} from "@/lib/weeklyAdsComparison";

export type WeeklyGoalTotals = Omit<
  WeeklyCampaignRow,
  "key" | "source" | "campaignId" | "campaign" | "kind"
>;

/** One goal's campaigns in a week, with totals of that goal only. */
export type WeeklyGoalGroup = {
  kind: WeeklyCampaignKind;
  rows: WeeklyCampaignRow[];
  totals: WeeklyGoalTotals;
};

/**
 * A week's campaigns by goal in a fixed order (sales, leads, traffic), each
 * with its own totals. Goals without campaigns are left out.
 */
export function groupWeeklyRowsByGoal(
  rows: WeeklyCampaignRow[],
): WeeklyGoalGroup[] {
  return WEEKLY_GOAL_ORDER.map((kind) => {
    const goalRows = rows.filter((row) => row.kind === kind);
    return { kind, rows: goalRows, totals: goalTotals(goalRows) };
  }).filter((group) => group.rows.length > 0);
}

/**
 * The report table's goal settings for the weekly tab, same as its main tables:
 * Facebook Insights is leads-only only when set to leads (otherwise each campaign
 * by its own goal), and Google falls back to the table's type for unknown goals.
 */
export function weeklySourceModesForTable(
  integrationSettings?: Record<string, unknown> | null,
): WeeklySourceModes {
  const campaignType = String(
    integrationSettings?.campaign_type || "",
  ).toLowerCase();
  return {
    facebook_insights: isFacebookLeadsOnlyTable(integrationSettings)
      ? "leads"
      : undefined,
    facebook_ecommerce: "ecommerce",
    google_ads: campaignType === "ecommerce" ? "ecommerce" : "leads",
  };
}

const WEEKLY_GOAL_ORDER: readonly WeeklyCampaignKind[] = [
  "ecommerce",
  "leads",
  "traffic",
];

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
      sum.spend += row.spend;
      sum.revenue += row.revenue;
      sum.addToCart += row.addToCart;
      return sum;
    },
    {
      impressions: 0,
      clicks: 0,
      results: 0,
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
