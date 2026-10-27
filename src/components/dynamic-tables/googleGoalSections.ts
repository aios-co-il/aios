import type { GoogleReportCampaignGoal } from "@/lib/pulseCampaignGoals";

/**
 * A Google Ads report's campaigns as one table per goal, sales first. A report
 * without campaigns keeps one empty table of the table's own goal.
 */
export function googleGoalSections<
  T extends { goal: GoogleReportCampaignGoal },
>(
  rows: T[],
  fallbackGoal: GoogleReportCampaignGoal,
): Array<{ goal: GoogleReportCampaignGoal; rows: T[] }> {
  const sections = GOOGLE_GOAL_ORDER.map((goal) => ({
    goal,
    rows: rows.filter((row) => row.goal === goal),
  })).filter((section) => section.rows.length > 0);
  return sections.length > 0 ? sections : [{ goal: fallbackGoal, rows: [] }];
}

const GOOGLE_GOAL_ORDER: GoogleReportCampaignGoal[] = ["ecommerce", "leads"];
