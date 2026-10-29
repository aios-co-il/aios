/** The parts of a report table (crm_tables) that set its own goal. */
export type GoalReportTable = {
  integration_type?: string | null;
  integration_settings?: Record<string, unknown> | null;
  category?: string | null;
};

/** Single source of truth for “is this CRM table an ecommerce report?” */
export function isEcommerceReportTable(table: GoalReportTable = {}): boolean {
  if (table.integration_type === "facebook_ecommerce") {
    return true;
  }
  if (String(table.category || "").trim() === "איקומרס") {
    return true;
  }
  return (
    String(table.integration_settings?.campaign_type || "")
      .trim()
      .toLowerCase() === "ecommerce"
  );
}

/** The ad report tables that hold campaigns of one goal unless set to ecommerce. */
const LEAD_DEFAULT_TABLE_TYPES: ReadonlySet<string> = new Set([
  "facebook_insights",
  "google_ads",
]);

/**
 * A report table's own goal, for what is set per table rather than per
 * campaign (the pulse's client goal mode and its per-goal table checks):
 * ecommerce for an ecommerce report table, leads for any other Meta or Google
 * Ads table, and null for a table without ad campaigns. Each campaign's own
 * goal is reportCampaignGoalOf's.
 */
export function reportTableGoal(
  table: GoalReportTable = {},
): "ecommerce" | "leads" | null {
  if (isEcommerceReportTable(table)) {
    return "ecommerce";
  }
  return LEAD_DEFAULT_TABLE_TYPES.has(table.integration_type ?? "")
    ? "leads"
    : null;
}
