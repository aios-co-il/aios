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

/**
 * A campaign or row that sends people to a Facebook Page or Instagram profile:
 * by its ad set destination, or, for rows synced before destination_type was
 * stored, by its optimization goal. Shared by the sync and the reports.
 */
export function isProfileTraffic(
  destinationType: unknown,
  optimizationGoal: unknown,
): boolean {
  return (
    PROFILE_DESTINATION_TYPES.has(String(destinationType ?? "")) ||
    PROFILE_OPTIMIZATION_GOALS.has(String(optimizationGoal ?? ""))
  );
}

/** Ad set destinations of Meta's profile visit ads (Traffic objective). */
const PROFILE_DESTINATION_TYPES = new Set([
  "FACEBOOK_PAGE",
  "INSTAGRAM_PROFILE",
  "INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE",
]);

/**
 * Optimization goals of profile visit ads. Meta's profile visit ad guides set
 * PROFILE_VISIT on Traffic campaigns; its field catalog lists
 * VISIT_INSTAGRAM_PROFILE ("Instagram profile visits").
 */
const PROFILE_OPTIMIZATION_GOALS = new Set([
  "PROFILE_VISIT",
  "VISIT_INSTAGRAM_PROFILE",
]);

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
