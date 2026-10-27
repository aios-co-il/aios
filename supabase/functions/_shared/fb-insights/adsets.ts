/**
 * Ad set fields every Facebook sync reads: the optimization goal and promoted
 * object decide a campaign's result, and destination_type says where its ads
 * send people (a website, a Facebook Page, an Instagram profile, …).
 */
export const FB_ADSET_FIELDS =
  "id,campaign_id,optimization_goal,promoted_object,destination_type";

/** An ad set as the Graph API returns it; values are checked, not trusted. */
type Adset = {
  id?: unknown;
  campaign_id?: unknown;
  destination_type?: unknown;
};

/** Where each ad set sends people, and where most of each campaign's ad sets do. */
export type DestinationTypeMaps = {
  byCampaign: Record<string, string>;
  byAdset: Record<string, string>;
};

/** Map ad set and campaign ids to their destination_type. */
export function buildDestinationTypeMaps(adsets: Adset[]): DestinationTypeMaps {
  const byAdset: Record<string, string> = {};
  for (const adset of adsets) {
    const adsetId = String(adset.id ?? "");
    const destination = normalizeAdsetValue(adset.destination_type);
    if (adsetId && destination) {
      byAdset[adsetId] = destination;
    }
  }
  return {
    byCampaign: dominantAdsetValueByCampaign(
      adsets,
      (adset) => adset.destination_type,
    ),
    byAdset,
  };
}

/** The destination of an insights row: its own ad set's, else its campaign's. */
export function resolveDestinationType(
  insight: { campaign_id?: unknown; adset_id?: unknown },
  maps: DestinationTypeMaps,
): string | null {
  const adsetId = String(insight.adset_id || "");
  return (
    (adsetId && maps.byAdset[adsetId]) ||
    maps.byCampaign[String(insight.campaign_id || "")] ||
    null
  );
}

/**
 * The most common value across each campaign's ad sets; ties go to the value
 * that sorts first, so a re-sync stores the same value.
 */
export function dominantAdsetValueByCampaign<T extends Adset>(
  adsets: T[],
  valueOf: (adset: T) => unknown,
): Record<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const adset of adsets) {
    const campaignId = String(adset.campaign_id ?? "");
    const value = normalizeAdsetValue(valueOf(adset));
    if (!campaignId || !value) {
      continue;
    }
    const campaignCounts = counts.get(campaignId) ?? new Map<string, number>();
    campaignCounts.set(value, (campaignCounts.get(value) ?? 0) + 1);
    counts.set(campaignId, campaignCounts);
  }
  const result: Record<string, string> = {};
  for (const [campaignId, campaignCounts] of counts) {
    result[campaignId] = [...campaignCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
  }
  return result;
}

/** Meta enum values compare upper-case and trimmed. */
function normalizeAdsetValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}
