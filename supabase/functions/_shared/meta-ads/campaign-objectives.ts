/**
 * Meta campaign objectives that make a campaign a sales campaign, for the Meta
 * sync, pulse, the reports, the dashboards and Carmen's report check. The
 * legacy CONVERSIONS objective is in neither list: it ran lead and sales
 * campaigns alike, so the stored type and the results decide those campaigns.
 */
export const META_SALES_OBJECTIVES: ReadonlySet<string> = new Set([
  "OUTCOME_SALES",
  "PRODUCT_CATALOG_SALES",
  "CATALOG_SALES",
  "SALES",
]);

/** Meta campaign objectives that make a campaign a lead campaign. */
export const META_LEAD_OBJECTIVES: ReadonlySet<string> = new Set([
  "OUTCOME_LEADS",
  "LEAD_GENERATION",
]);

/** The goal a Meta campaign objective decides on its own; null when it cannot tell. */
export function metaObjectiveGoal(
  objective: unknown,
): "ecommerce" | "leads" | null {
  const normalized = String(objective ?? "")
    .trim()
    .toUpperCase();
  if (META_SALES_OBJECTIVES.has(normalized)) {
    return "ecommerce";
  }
  if (META_LEAD_OBJECTIVES.has(normalized)) {
    return "leads";
  }
  return null;
}
