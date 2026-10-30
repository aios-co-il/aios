/**
 * Campaign goals of the reports in display order: sales, leads, traffic. Each
 * goal gets its own table and metrics. A new goal also needs classifier rules
 * and the per-goal tables that each report and page lists by hand.
 */
export const REPORT_CAMPAIGN_GOALS = ["ecommerce", "leads", "traffic"] as const;

/** A campaign's goal in the reports (pulse has its own goals in pulseDashboard). */
export type ReportCampaignGoal = (typeof REPORT_CAMPAIGN_GOALS)[number];

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
  rows: T[],
  goalOf: (row: T) => G,
): Array<{ goal: G; rows: T[] }> {
  return REPORT_CAMPAIGN_GOALS.flatMap((goal) => {
    const goalRows = rows.filter((row) => goalOf(row) === goal);
    return goalRows.length > 0
      ? [{ goal: goalOf(goalRows[0]), rows: goalRows }]
      : [];
  });
}
