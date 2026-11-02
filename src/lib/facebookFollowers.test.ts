import { describe, expect, it } from "vitest";
import {
  addFacebookFollowers,
  costPerFollower,
  emptyFacebookFollowers,
  formatFollowerCell,
  showsFollowerColumns,
  sumFacebookFollowers,
} from "./facebookFollowers";

const followersOf = (...rows: Array<Record<string, unknown>>) =>
  rows.reduce(addFacebookFollowers, emptyFacebookFollowers());
/** A campaign row built from its stored Insights rows. */
const campaign = (...rows: Array<Record<string, unknown>>) => ({
  followers: followersOf(...rows),
});

const profileDay = (spend: number, newFollowers: number) => ({
  destination_type: "INSTAGRAM_PROFILE",
  spend,
  new_followers: newFollowers,
});
// Website traffic with a few follows from the ad header's Follow button.
const websiteDay = (spend: number, newFollowers: number) => ({
  destination_type: "WEBSITE",
  optimization_goal: "LINK_CLICKS",
  spend,
  new_followers: newFollowers,
});
// A profile campaign's row synced before the sync stored new_followers.
const profileDayBeforeFollowers = (spend: number) => ({
  optimization_goal: "PROFILE_VISIT",
  spend,
});

describe("addFacebookFollowers", () => {
  it("sums the follower count and its spend over a campaign's rows", () => {
    expect(
      followersOf(
        { new_followers: 12, spend: 50 },
        { new_followers: 7, spend: 30 },
      ),
    ).toStrictEqual({
      newFollowers: 19,
      followerSpend: 80,
      profileTraffic: false,
    });
  });

  it("rows without a follower count add neither followers nor spend", () => {
    expect(followersOf({ spend: 300 })).toStrictEqual({
      newFollowers: null,
      followerSpend: 0,
      profileTraffic: false,
    });
    expect(
      followersOf({ spend: 300 }, { new_followers: 0, spend: 20 }),
    ).toStrictEqual({
      newFollowers: 0,
      followerSpend: 20,
      profileTraffic: false,
    });
  });

  it("marks Page and profile destinations as profile traffic", () => {
    for (const destination of [
      "FACEBOOK_PAGE",
      "INSTAGRAM_PROFILE",
      "INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE",
    ]) {
      expect(
        followersOf({ destination_type: destination }).profileTraffic,
      ).toBe(true);
    }
    expect(followersOf({ destination_type: "WEBSITE" }).profileTraffic).toBe(
      false,
    );
  });

  it("rows synced before destination_type match on their optimization goal", () => {
    expect(
      followersOf({ optimization_goal: "PROFILE_VISIT" }).profileTraffic,
    ).toBe(true);
    expect(
      followersOf({ optimization_goal: "VISIT_INSTAGRAM_PROFILE" })
        .profileTraffic,
    ).toBe(true);
    expect(
      followersOf({ optimization_goal: "LINK_CLICKS" }).profileTraffic,
    ).toBe(false);
  });
});

describe("showsFollowerColumns", () => {
  it("hides the columns for website traffic, even with a few follows", () => {
    expect(showsFollowerColumns([campaign(websiteDay(300, 2)), {}])).toBe(
      false,
    );
  });

  it("shows them for a profile campaign even before it gains followers", () => {
    expect(
      showsFollowerColumns([
        campaign(websiteDay(300, 0)),
        campaign(profileDay(50, 0)),
      ]),
    ).toBe(true);
  });
});

describe("sumFacebookFollowers", () => {
  it("adds up the campaigns that carry a follower count", () => {
    expect(
      sumFacebookFollowers([
        campaign(profileDay(120, 30)),
        campaign(websiteDay(300, 2)),
        campaign({ spend: 80 }),
      ]),
    ).toStrictEqual({
      newFollowers: 32,
      followerSpend: 420,
      profileTraffic: true,
    });
  });

  it("is null when no campaign carries a follower count", () => {
    expect(
      sumFacebookFollowers([campaign({ spend: 80 }), {}]).newFollowers,
    ).toBeNull();
  });
});

describe("costPerFollower", () => {
  it("divides spend by new followers", () => {
    expect(costPerFollower([campaign(profileDay(120, 40))])).toBe(3);
  });

  it("leaves website traffic and its follows out, mixed or alone", () => {
    const blog = campaign(websiteDay(300, 2));
    expect(costPerFollower([campaign(profileDay(120, 30)), blog])).toBe(4);
    expect(costPerFollower([blog])).toBeNull();
  });

  it("counts only the spend of rows synced with a follower count", () => {
    const profile = campaign(
      profileDayBeforeFollowers(300),
      profileDay(120, 30),
    );
    expect(profile.followers.profileTraffic).toBe(true);
    expect(costPerFollower([profile])).toBe(4);
    expect(
      costPerFollower([campaign(profileDayBeforeFollowers(300))]),
    ).toBeNull();
  });

  it("is null without followers", () => {
    expect(costPerFollower([campaign(profileDay(120, 0))])).toBeNull();
    expect(costPerFollower([{}])).toBeNull();
  });
});

describe("formatFollowerCell", () => {
  it("formats a value and shows a dash for none", () => {
    expect(formatFollowerCell(4, (value) => `₪${value}`)).toBe("₪4");
    expect(formatFollowerCell(0, String)).toBe("0");
    expect(formatFollowerCell(null, String)).toBe("—");
  });
});
