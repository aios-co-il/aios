import {
  REPORT_CAMPAIGN_GOALS,
  type ReportCampaignGoal,
} from "../../supabase/functions/_shared/campaign-goal/report-goals.ts";

// The goals live with the pulse, so the reports and the pulse share one list.
export { REPORT_CAMPAIGN_GOALS, type ReportCampaignGoal };
// Each record's campaign goal as its table's report shows it.
export {
  reportCampaignGoalOf,
  reportCampaignKey,
  type CampaignGoalRecord,
  type CampaignGoalTable,
  type CampaignGoalVerdict,
} from "../../supabase/functions/_shared/campaign-goal/campaign-goals.ts";

/** Title of each goal's campaign table. */
export const CAMPAIGN_GOAL_TITLES: Record<ReportCampaignGoal, string> = {
  ecommerce: "קמפייני מכירות",
  leads: "קמפייני לידים",
  traffic: "קמפייני תנועה",
};

/** Total-row label of each goal's table when a report shows several goals. */
export const CAMPAIGN_GOAL_TOTAL_LABELS: Record<ReportCampaignGoal, string> = {
  ecommerce: "סה״כ מכירות",
  leads: "סה״כ לידים",
  traffic: "סה״כ תנועה",
};

/**
 * Rows split into one group per goal in report order, leaving out goals without
 * rows. Every goal is in the order list, so no row can drop out of the tables.
 */
export function groupRowsByCampaignGoal<G extends ReportCampaignGoal, T>(
  rows: Array<T>,
  goalOf: (row: T) => G,
): Array<{ goal: G; rows: T[] }> {
  return REPORT_CAMPAIGN_GOALS.flatMap((goal) => {
    const goalRows = rows.filter((row) => goalOf(row) === goal);
    return goalRows.length > 0
      ? [{ goal: goalOf(goalRows[0]), rows: goalRows }]
      : [];
  });
}
