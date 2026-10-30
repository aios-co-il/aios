/**
 * A Google campaign whose goal came from its own conversion goal (or a manual
 * mapping) is a sales campaign even inside a leads report.
 */
export function isConfirmedGoogleSalesCampaign(
  row: { classification_source?: string | null },
  table: { integration_type?: string | null },
): boolean {
  return (
    table.integration_type === "google_ads" &&
    OWN_GOAL_SOURCES.has(row.classification_source ?? "")
  );
}

const OWN_GOAL_SOURCES = new Set(["platform_goal", "explicit_mapping"]);
