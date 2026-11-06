import type { GoogleCampaignGoal } from "./google-classify.ts";
import { isEcommerceReportTable, type GoalReportTable } from "./table-goal.ts";

export type GoogleGoalPresence = { hasEcommerce: boolean; hasLeads: boolean };

/** Which goals a set of campaigns or rows holds; with none, the fallback's. */
export function googleGoalPresence(
  goals: Array<GoogleCampaignGoal>,
  fallback: GoogleCampaignGoal,
): GoogleGoalPresence {
  if (!goals.length) {
    return {
      hasEcommerce: fallback === "ecommerce",
      hasLeads: fallback === "leads",
    };
  }
  return {
    hasEcommerce: goals.includes("ecommerce"),
    hasLeads: goals.includes("leads"),
  };
}

/**
 * A report's goal for Google rows no rule can key: ecommerce when a Google
 * table is an ecommerce report, by its settings or its "איקומרס" category
 * (isEcommerceReportTable, AIO-494).
 */
export function googleReportFallbackGoal(
  tables: Array<GoalReportTable>,
): GoogleCampaignGoal {
  const ecommerce = tables.some(
    (table) =>
      table.integration_type === "google_ads" && isEcommerceReportTable(table),
  );
  return ecommerce ? "ecommerce" : "leads";
}
