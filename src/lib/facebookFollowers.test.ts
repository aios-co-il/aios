import { describe, expect, it } from "vitest";
import {
  addFacebookFollowers,
  costPerFollower,
  emptyFacebookFollowers,
  FOLLOWER_COLUMN_LABELS,
  showsFollowerColumns,
  sumFacebookFollowers,
} from "./facebookFollowers";

const followersOf = (...rows: Array<Record<string, unknown>>) =>
  rows.reduce(addFacebookFollowers, emptyFacebookFollowers());

describe("addFacebookFollowers", () => {
  it("sums the stored follower count over a campaign's rows", () => {
    expect(
      followersOf({ new_followers: 12 }, { new_followers: 7 }, {}),
    ).toStrictEqual({ newFollowers: 19, profileTraffic: false });
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
  const website = { spend: 100, followers: emptyFacebookFollowers() };

  it("hides the columns for website traffic only", () => {
    expect(showsFollowerColumns([website, {}])).toBe(false);
  });

  it("shows them for a profile campaign even before it gains followers", () => {
    const profile = {
      spend: 50,
      followers: { newFollowers: 0, profileTraffic: true },
    };
    expect(showsFollowerColumns([website, profile])).toBe(true);
  });

  it("shows them for any campaign that gained followers", () => {
    const gained = {
      spend: 50,
      followers: { newFollowers: 3, profileTraffic: false },
    };
    expect(showsFollowerColumns([website, gained])).toBe(true);
  });
});

describe("costPerFollower", () => {
  const profile = {
    spend: 120,
    followers: { newFollowers: 40, profileTraffic: true },
  };
  const website = { spend: 300, followers: emptyFacebookFollowers() };

  it("divides spend by new followers", () => {
    expect(costPerFollower([profile])).toBe(3);
  });

  it("leaves website traffic spend out of the total", () => {
    expect(costPerFollower([profile, website])).toBe(3);
    expect(sumFacebookFollowers([profile, website])).toStrictEqual({
      newFollowers: 40,
      profileTraffic: true,
    });
  });

  it("is null without followers", () => {
    expect(costPerFollower([website])).toBeNull();
    expect(
      costPerFollower([{ ...profile, followers: emptyFacebookFollowers() }]),
    ).toBeNull();
  });
});

describe("FOLLOWER_COLUMN_LABELS", () => {
  it("uses the synced field's name for new followers", () => {
    expect(FOLLOWER_COLUMN_LABELS).toStrictEqual({
      newFollowers: "עוקבים חדשים",
      costPerFollower: "עלות לעוקב",
    });
  });
});
