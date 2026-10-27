/** A campaign's goal in the reports; each goal gets its own table and metrics. */
export type CampaignGoal = "ecommerce" | "leads" | "traffic";

/** Title of each goal's campaign table. */
export const CAMPAIGN_GOAL_TITLES: Record<CampaignGoal, string> = {
  ecommerce: "קמפייני מכירות",
  leads: "קמפייני לידים",
  traffic: "קמפייני תנועה",
};

/** Total-row label of each goal's table when a report shows several goals. */
export const CAMPAIGN_GOAL_TOTAL_LABELS: Record<CampaignGoal, string> = {
  ecommerce: "סה״כ מכירות",
  leads: "סה״כ לידים",
  traffic: "סה״כ תנועה",
};
