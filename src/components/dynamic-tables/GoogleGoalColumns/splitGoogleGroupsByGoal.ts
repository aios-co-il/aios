import { googleGoalPresence } from "@/lib/googleGoalPresence";
import type { GoogleCampaignGoal } from "../../../../supabase/functions/_shared/pulse/google-campaign-goal.ts";

export type GoogleGoalTotals = {
  cost: number;
  conversions: number;
  conversions_value: number;
};

export type GoogleGoalSplit = {
  /** Both goals present: one table, a goal column, each row filled by its own goal. */
  mixedGoals: boolean;
  isEcommerce: boolean;
  ecommerceTotals: GoogleGoalTotals;
  leadTotals: GoogleGoalTotals;
};

/**
 * How a report table shows its Google Ads rows (campaigns, ad sets or ads) when
 * each row carries its campaign's goal. Totals are kept per goal so revenue and
 * ROAS never include lead spend, and cost per lead never includes sales spend.
 * With no rows the report's fallback goal decides.
 */
export function splitGoogleGroupsByGoal(
  groups: Array<GoogleGoalTotals & { goal: GoogleCampaignGoal }>,
  fallbackGoal: GoogleCampaignGoal,
): GoogleGoalSplit {
  const { hasEcommerce, hasLeads } = googleGoalPresence(
    groups.map((group) => group.goal),
    fallbackGoal,
  );
  return {
    mixedGoals: hasEcommerce && hasLeads,
    isEcommerce: hasEcommerce && !hasLeads,
    ecommerceTotals: goalTotals(groups, "ecommerce"),
    leadTotals: goalTotals(groups, "leads"),
  };
}

/** Cost, conversions and conversion value summed over the rows of one goal. */
function goalTotals(
  groups: Array<GoogleGoalTotals & { goal: GoogleCampaignGoal }>,
  goal: GoogleCampaignGoal,
): GoogleGoalTotals {
  return groups
    .filter((group) => group.goal === goal)
    .reduce(
      (acc, group) => ({
        cost: acc.cost + group.cost,
        conversions: acc.conversions + group.conversions,
        conversions_value: acc.conversions_value + group.conversions_value,
      }),
      { cost: 0, conversions: 0, conversions_value: 0 },
    );
}
