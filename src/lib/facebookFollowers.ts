import { NEW_FOLLOWERS_LABEL } from "../../supabase/functions/_shared/fb-insights/followers.ts";

/** A campaign's ad-attributed new followers and whether it sends people to a Page or profile. */
export type FacebookFollowerTotals = {
  newFollowers: number;
  profileTraffic: boolean;
};

/** Header labels of the follower columns in every traffic table. */
export const FOLLOWER_COLUMN_LABELS = {
  newFollowers: NEW_FOLLOWERS_LABEL,
  costPerFollower: "עלות לעוקב",
} as const;

/** Follower totals of a campaign before any of its rows are added. */
export const emptyFacebookFollowers = (): FacebookFollowerTotals => ({
  newFollowers: 0,
  profileTraffic: false,
});

/** Adds one stored Facebook Insights row to a campaign's follower totals. */
export function addFacebookFollowers(
  totals: FacebookFollowerTotals,
  data: Record<string, unknown>,
): FacebookFollowerTotals {
  return {
    newFollowers: totals.newFollowers + (Number(data.new_followers) || 0),
    profileTraffic: totals.profileTraffic || isFacebookProfileTraffic(data),
  };
}

/**
 * A traffic table shows the follower columns once any of its campaigns sends
 * people to a Page or profile, or gained followers from its ads.
 */
export function showsFollowerColumns(
  rows: Array<{ followers?: FacebookFollowerTotals }>,
): boolean {
  return rows.some((row) => showsFollowers(row.followers));
}

/** Follower totals of several campaigns, e.g. a table's total row. */
export function sumFacebookFollowers(
  rows: Array<{ followers?: FacebookFollowerTotals }>,
): FacebookFollowerTotals {
  return {
    newFollowers: rows.reduce(
      (sum, row) => sum + (row.followers?.newFollowers ?? 0),
      0,
    ),
    profileTraffic: rows.some((row) => row.followers?.profileTraffic),
  };
}

/**
 * Spend per new follower over the campaigns that show followers, so website
 * traffic spend in the same table does not inflate it. Null without followers.
 */
export function costPerFollower(
  rows: Array<{ spend: number; followers?: FacebookFollowerTotals }>,
): number | null {
  const followerRows = rows.filter((row) => showsFollowers(row.followers));
  const followers = sumFacebookFollowers(followerRows).newFollowers;
  const spend = followerRows.reduce((sum, row) => sum + row.spend, 0);
  return followers > 0 ? spend / followers : null;
}

/**
 * A row that sends people to a Facebook Page or Instagram profile. Rows synced
 * before destination_type was stored still match on their optimization goal.
 */
function isFacebookProfileTraffic(data: Record<string, unknown>): boolean {
  return (
    PROFILE_DESTINATION_TYPES.has(String(data.destination_type ?? "")) ||
    PROFILE_OPTIMIZATION_GOALS.has(String(data.optimization_goal ?? ""))
  );
}

/** A campaign whose row shows followers and counts toward cost per follower. */
function showsFollowers(
  followers: FacebookFollowerTotals | undefined,
): boolean {
  return (
    !!followers && (followers.profileTraffic || followers.newFollowers > 0)
  );
}

/** Ad set destinations of Meta's profile visit ads (Traffic objective). */
const PROFILE_DESTINATION_TYPES = new Set([
  "FACEBOOK_PAGE",
  "INSTAGRAM_PROFILE",
  "INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE",
]);

/** Optimization goals of profile visit ads; the second is the legacy name. */
const PROFILE_OPTIMIZATION_GOALS = new Set([
  "PROFILE_VISIT",
  "VISIT_INSTAGRAM_PROFILE",
]);
