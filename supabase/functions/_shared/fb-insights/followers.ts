/**
 * New followers an insights row attributes to the ads: Facebook Page follows
 * plus Instagram profile follows. The two platforms are different audiences,
 * so they add up; aliases within one platform count once.
 * `countOf` sums the row's deduplicated actions of the given action types;
 * `instagramFollows` is the row's Ads Manager "Instagram follows" metric
 * (instagramFollows.ts), the same follows as the Instagram action types.
 */
export function countNewFollowers(
  countOf: (actionTypes: Array<string>) => number,
  instagramFollows = 0,
): number {
  const maxOf = (actionTypes: Array<string>) =>
    Math.max(0, ...actionTypes.map((type) => countOf([type])));
  return (
    maxOf(FACEBOOK_FOLLOW_ACTION_TYPES) +
    Math.max(maxOf(INSTAGRAM_FOLLOW_ACTION_TYPES), instagramFollows)
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
 * Instagram profile follows, if `actions` carries them. Ads Manager reports
 * them as the separate `instagram_profile_follow_v2` metric (Amy Bechor's
 * Instagram traffic campaign: 381 follows in Ads Manager, none synced), which
 * instagramFollows.ts reads; these keys stay as aliases (MAX, never SUM).
 */
const INSTAGRAM_FOLLOW_ACTION_TYPES = [
  "instagram_profile_follow",
  "instagram_profile_follow_v2",
];
