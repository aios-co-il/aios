import { groupRowsByCampaignGoal } from "@/lib/campaignGoals";
import type { GoogleCampaignGoal } from "../../../supabase/functions/_shared/pulse/google-campaign-goal.ts";

type GoogleGoalRow = {
  goal: GoogleCampaignGoal;
  conversions: number;
  conversions_value: number;
};

/** A Google Ads report's rows as one table per goal, and what the page shows around them. */
export type GoogleGoalSections<T extends GoogleGoalRow> = {
  /** One table per goal, sales first; an empty report keeps one table of its own goal. */
  sections: Array<{ goal: GoogleCampaignGoal; rows: T[] }>;
  /** Both goals present: each table gets a title and the report a spend line across goals. */
  mixedGoals: boolean;
  /** Only sales rows, or an empty report whose own goal is sales. */
  isEcommerce: boolean;
  /** Google Ads' conversions and value over the sales rows, for the WooCommerce comparison. */
  ecommerceTotals: { conversions: number; conversions_value: number };
};

/**
 * Splits a Google Ads report's rows (campaigns, ad sets or ads) by their
 * campaign's goal, so revenue and ROAS never include lead spend and cost per
 * lead never includes sales spend.
 */
export function googleGoalSections<T extends GoogleGoalRow>(
  rows: T[],
  fallbackGoal: GoogleCampaignGoal,
): GoogleGoalSections<T> {
  const grouped = groupRowsByCampaignGoal(rows, (row) => row.goal);
  const sections =
    grouped.length > 0 ? grouped : [{ goal: fallbackGoal, rows: [] }];
  const salesRows =
    sections.find((section) => section.goal === "ecommerce")?.rows ?? [];
  return {
    sections,
    mixedGoals: sections.length > 1,
    isEcommerce: sections.length === 1 && sections[0].goal === "ecommerce",
    ecommerceTotals: {
      conversions: sum(salesRows, (row) => row.conversions),
      conversions_value: sum(salesRows, (row) => row.conversions_value),
    },
  };
}

/** Sum of one number over the rows. */
function sum<T>(rows: T[], value: (row: T) => number): number {
  return rows.reduce((total, row) => total + value(row), 0);
}
