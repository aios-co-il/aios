/**
 * The ads rows a dashboard sums, chosen in the query so ad set and ad rows are
 * not sent to a page that drops them. The rule is the dashboards' own
 * (`shouldIncludeInAdsDashboardAggregate` in src/lib/adsEntityLevel.ts): in an
 * ads table, a row whose `entity_level` lowercases to `adset` or `ad` is left
 * out, and every other row counts as a campaign row, one without a level or
 * with an unknown one included.
 */

/** The table kinds the ads syncs write with an entity level. */
export const ADS_TABLE_TYPES = [
  "facebook_insights",
  "facebook_ecommerce",
  "google_ads",
  "tiktok",
] as const;

/**
 * The ads tables whose ad set and ad rows no dashboard tab reads, so share
 * links and the weekly comparison read their campaign rows only. Google Ads
 * stays whole: the continents tab names and the weekly comparison's Google
 * goals read its ad group and ad rows. TikTok stays whole: the shared
 * dashboard's platform totals sum every TikTok row.
 */
export const CAMPAIGN_ROWS_ONLY_TYPES: ReadonlyArray<string> = [
  "facebook_insights",
  "facebook_ecommerce",
];

/**
 * PostgREST `or` terms for the rows the dashboards sum. `ilike` without a
 * wildcard is a case-insensitive equality, as the dashboards lowercase the
 * level; a missing level is null in SQL and needs its own term.
 */
export const DASHBOARD_CAMPAIGN_ROWS_FILTER =
  "data->>entity_level.is.null," +
  "and(data->>entity_level.not.ilike.adset,data->>entity_level.not.ilike.ad)";

/** Whether rows of this table kind carry an entity level. */
export function isAdsTableType(type: string | null | undefined): boolean {
  return ADS_TABLE_TYPES.some((adsType) => adsType === type);
}

/**
 * `filter` (PostgREST `or` terms, or null for none) narrowed to the rows the
 * dashboards sum, as one `or` value: a query takes one `or` parameter, so two
 * term lists are nested in a single and().
 */
export function withDashboardCampaignRows(filter: string | null): string {
  if (!filter) {
    return DASHBOARD_CAMPAIGN_ROWS_FILTER;
  }
  return `and(or(${filter}),or(${DASHBOARD_CAMPAIGN_ROWS_FILTER}))`;
}
