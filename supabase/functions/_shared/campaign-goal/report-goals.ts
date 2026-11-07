/**
 * Campaign goals of the reports in display order: sales, leads, traffic. Each
 * goal gets its own table and metrics in every report, dashboard and the
 * pulse. A new goal also needs classifier rules and the per-goal tables that
 * each report and page lists by hand.
 */
export const REPORT_CAMPAIGN_GOALS = ["ecommerce", "leads", "traffic"] as const;

/** A campaign's goal in the reports, the dashboards and the pulse. */
export type ReportCampaignGoal = (typeof REPORT_CAMPAIGN_GOALS)[number];

/**
 * The pulse's name for a report goal. The pulse calls traffic "engagement":
 * its stored campaign keys, targets and dashboard use that name.
 */
export type PulseCampaignGoalName = "ecommerce" | "leads" | "engagement";

/** The pulse's name for a report goal (traffic is "engagement"). */
export function pulseGoalName(goal: ReportCampaignGoal): PulseCampaignGoalName {
  return goal === "traffic" ? "engagement" : goal;
}
