/**
 * New followers an insights row attributes to the ads: Facebook Page follows
 * plus Instagram profile follows. The two platforms are different audiences,
 * so they add up; aliases within one platform count once.
 * `countOf` sums the row's deduplicated actions of the given action types.
 */
export function countNewFollowers(
  countOf: (actionTypes: string[]) => number,
): number {
  const maxOf = (actionTypes: string[]) =>
    Math.max(0, ...actionTypes.map((type) => countOf([type])));
  return (
    maxOf(FACEBOOK_FOLLOW_ACTION_TYPES) + maxOf(INSTAGRAM_FOLLOW_ACTION_TYPES)
  );
}

/** Column name of the stored follower count, shared by the sync and the reports. */
export const NEW_FOLLOWERS_LABEL = "עוקבים חדשים";

/**
 * Facebook Page follows attributed to the ads. Meta still reports them under
 * `like` ("Facebook likes": "The number of followers of your Facebook Page").
 */
const FACEBOOK_FOLLOW_ACTION_TYPES = ["like"];

/**
 * Instagram profile follows attributed to the ads, reported from 7 Jul 2025.
 * Meta's field catalog names the metric `instagram_profile_follow_v2` and
 * connectors read `instagram_profile_follow`; the Ads Action Stats reference
 * lists neither, so both are aliases of one count (MAX, never SUM).
 * Unverified against a live account: AIO-264's Staging sync confirms which key
 * `actions` carries at our Graph version, and only that key stays.
 */
const INSTAGRAM_FOLLOW_ACTION_TYPES = [
  "instagram_profile_follow",
  "instagram_profile_follow_v2",
];
