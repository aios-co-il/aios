import { NEW_FOLLOWERS_LABEL } from "../../supabase/functions/_shared/fb-insights/followers.ts";

/**
 * A campaign's ad-attributed new followers. Only rows synced with a follower
 * count add to it, together with their own spend: rows stored before the sync
 * read follows would otherwise show a false 0 and inflate cost per follower.
 */
export type FacebookFollowerTotals = {
  /** Null while none of the campaign's rows carries a follower count. */
  newFollowers: number | null;
  /** Spend of the rows that carry a follower count. */
  followerSpend: number;
  /** Sends people to a Facebook Page or Instagram profile. */
  profileTraffic: boolean;
};

/** Header labels of the follower columns in every traffic table. */
export const FOLLOWER_COLUMN_LABELS = {
  newFollowers: NEW_FOLLOWERS_LABEL,
  costPerFollower: "עלות לעוקב",
} as const;

/** Follower totals of a campaign before any of its rows are added. */
export const emptyFacebookFollowers = (): FacebookFollowerTotals => ({
  newFollowers: null,
  followerSpend: 0,
  profileTraffic: false,
});

/** Adds one stored Facebook Insights row to a campaign's follower totals. */
export function addFacebookFollowers(
  totals: FacebookFollowerTotals,
  data: Record<string, unknown>,
): FacebookFollowerTotals {
  const hasCount = "new_followers" in data;
  return mergeFollowerTotals(totals, {
    newFollowers: hasCount ? Number(data.new_followers) || 0 : null,
    followerSpend: hasCount ? Number(data.spend) || 0 : 0,
    profileTraffic: isFacebookProfileTraffic(data),
  });
}

/**
 * A traffic table shows the follower columns once any of its campaigns sends
 * people to a Page or profile. Website traffic picks up a few follows from the
 * ad's Follow button, which does not make it a follower campaign.
 */
export function showsFollowerColumns(
  rows: Array<{ followers?: FacebookFollowerTotals }>,
): boolean {
  return rows.some((row) => row.followers?.profileTraffic === true);
}

/** Follower totals of several campaigns, e.g. a table's total row. */
export function sumFacebookFollowers(
  rows: Array<{ followers?: FacebookFollowerTotals }>,
): FacebookFollowerTotals {
  return rows.reduce(
    (sum, row) =>
      mergeFollowerTotals(sum, row.followers ?? emptyFacebookFollowers()),
    emptyFacebookFollowers(),
  );
}

/**
 * Spend per new follower of the Page and profile campaigns. Follows a website
 * campaign picks up still count in the follower total, but neither they nor
 * that campaign's spend enter this price. Null when there are no such follows.
 */
export function costPerFollower(
  rows: Array<{ followers?: FacebookFollowerTotals }>,
): number | null {
  const { newFollowers, followerSpend } = sumFacebookFollowers(
    rows.filter((row) => row.followers?.profileTraffic),
  );
  return newFollowers !== null && newFollowers > 0
    ? followerSpend / newFollowers
    : null;
}

/** A follower cell's text: the formatted value, or a dash when there is none. */
export function formatFollowerCell(
  value: number | null,
  format: (value: number) => string,
): string {
  return value === null ? "—" : format(value);
}

/** Two follower totals as one; the count stays null only when both are. */
function mergeFollowerTotals(
  a: FacebookFollowerTotals,
  b: FacebookFollowerTotals,
): FacebookFollowerTotals {
  return {
    newFollowers:
      a.newFollowers === null && b.newFollowers === null
        ? null
        : (a.newFollowers ?? 0) + (b.newFollowers ?? 0),
    followerSpend: a.followerSpend + b.followerSpend,
    profileTraffic: a.profileTraffic || b.profileTraffic,
  };
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
