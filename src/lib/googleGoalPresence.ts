import type { GoogleCampaignGoal } from "../../supabase/functions/_shared/pulse/google-campaign-goal.ts";

export type GoogleGoalPresence = { hasEcommerce: boolean; hasLeads: boolean };

/** Which goals a set of campaigns or rows holds; with none, the fallback's. */
export function googleGoalPresence(
  goals: GoogleCampaignGoal[],
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

/** A report's goal for Google rows no rule can key: ecommerce when a Google table is set to ecommerce. */
export function googleReportFallbackGoal(
  tables: Array<{
    integration_type?: string | null;
    integration_settings?: Record<string, unknown> | null;
  }>,
): GoogleCampaignGoal {
  const ecommerce = tables.some(
    (table) =>
      table.integration_type === "google_ads" &&
      table.integration_settings?.campaign_type === "ecommerce",
  );
  return ecommerce ? "ecommerce" : "leads";
}
