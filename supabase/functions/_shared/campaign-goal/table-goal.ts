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
