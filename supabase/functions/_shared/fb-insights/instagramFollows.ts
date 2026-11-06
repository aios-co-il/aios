import type { AdsEntityLevel } from "../ads-sync/levels.ts";

/**
 * Ads Manager's "Instagram follows" column. Meta reports it as its own
 * insights metric, not inside `actions`, so the main insights read misses it.
 */
export const INSTAGRAM_FOLLOWS_FIELD = "instagram_profile_follow_v2";

/**
 * The metric dates from July 2025, after the v21.0 the main insights read
 * uses, so this read asks a newer Graph version.
 */
const INSTAGRAM_FOLLOWS_GRAPH_VERSION = "v24.0";

/** Instagram follows per entity and day, keyed by instagramFollowsKey. */
export type InstagramFollows = Map<string, number>;

/** An insights row as the Graph API returns it; values are checked, not trusted. */
type InsightRow = Record<string, unknown>;

type InsightsPage = {
  data?: Array<InsightRow>;
  error?: { message?: string };
  paging?: { next?: string };
};

/**
 * Read Instagram follows per entity and day in its own request, so a Graph
 * error here never fails the insights sync. On an error the read is logged and
 * returns no follows; rows then keep the follows found in `actions`.
 */
export async function fetchInstagramFollows(
  adAccountId: string,
  level: AdsEntityLevel,
  sinceStr: string,
  untilStr: string,
  accessToken: string,
  fetchPage: typeof fetch = fetch,
): Promise<InstagramFollows> {
  const follows: InstagramFollows = new Map();
  let next: string | null =
    `https://graph.facebook.com/${INSTAGRAM_FOLLOWS_GRAPH_VERSION}/${adAccountId}/insights?level=${level}` +
    `&fields=${ENTITY_ID_FIELD[level]},${INSTAGRAM_FOLLOWS_FIELD}` +
    `&time_range={"since":"${sinceStr}","until":"${untilStr}"}` +
    "&time_increment=1&use_unified_attribution_setting=true&limit=500" +
    `&access_token=${accessToken}`;
  try {
    while (next) {
      const response = await fetchPage(next);
      const page: InsightsPage = await response.json();
      if (page.error) {
        throw new Error(page.error.message || JSON.stringify(page.error));
      }
      for (const row of page.data ?? []) {
        const count = Number(row[INSTAGRAM_FOLLOWS_FIELD]) || 0;
        if (count > 0) {
          follows.set(instagramFollowsKey(level, row), count);
        }
      }
      next = page.paging?.next || null;
    }
  } catch (err) {
    console.error(
      `[fbInsights] level=${level} instagram follows fetch failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return new Map();
  }
  return follows;
}

/** The entity and day an insights row of `level` belongs to. */
export function instagramFollowsKey(
  level: AdsEntityLevel,
  row: InsightRow,
): string {
  return `${level}:${String(row[ENTITY_ID_FIELD[level]] ?? "")}:${String(row.date_start ?? "")}`;
}

/** The id field that names an insights row's entity at each level. */
const ENTITY_ID_FIELD: Record<AdsEntityLevel, string> = {
  campaign: "campaign_id",
  adset: "adset_id",
  ad: "ad_id",
};
