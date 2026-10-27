import { assertEquals } from "jsr:@std/assert@1";
import { buildInsightRecord } from "../fbInsights.ts";
import { buildDestinationTypeMaps } from "./adsets.ts";
import { countNewFollowers } from "./followers.ts";

type Action = { action_type: string; value: string };

const CAMPAIGN_ID = "120250000000000001";
const statuses = {
  [CAMPAIGN_ID]: {
    id: CAMPAIGN_ID,
    name: "תנועה לפרופיל",
    objective: "OUTCOME_TRAFFIC",
    effective_status: "ACTIVE",
    configured_status: "ACTIVE",
  },
};
const destinations = buildDestinationTypeMaps([
  {
    id: "as-profile",
    campaign_id: CAMPAIGN_ID,
    destination_type: "INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE",
  },
]);

/** One day of a profile-visit traffic campaign, shaped like a Graph insights row. */
function profileTrafficRow(insight: {
  actions?: Action[];
  conversions?: Action[];
}) {
  return buildInsightRecord(
    {
      date_start: "2026-10-20",
      campaign_id: CAMPAIGN_ID,
      campaign_name: "תנועה לפרופיל",
      impressions: "5400",
      clicks: "210",
      spend: "120.50",
      ...insight,
    },
    statuses,
    {},
    { [CAMPAIGN_ID]: "PROFILE_VISIT" },
    undefined,
    destinations,
  );
}

const action = (action_type: string, value: number): Action => ({
  action_type,
  value: String(value),
});

Deno.test("buildInsightRecord stores new followers", async (t) => {
  await t.step("Facebook Page follows arrive as `like`", () => {
    const row = profileTrafficRow({
      actions: [
        action("like", 12),
        action("page_engagement", 40),
        action("post_engagement", 28),
      ],
    });
    assertEquals(row.new_followers, 12);
    assertEquals(row.campaign_type, "traffic");
    assertEquals(row.destination_type, "INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE");
  });

  await t.step("Instagram follows under either key count once", () => {
    const either = (type: string) =>
      profileTrafficRow({ actions: [action(type, 7)] }).new_followers;
    assertEquals(either("instagram_profile_follow"), 7);
    assertEquals(either("instagram_profile_follow_v2"), 7);
    const both = profileTrafficRow({
      actions: [
        action("instagram_profile_follow", 7),
        action("instagram_profile_follow_v2", 9),
      ],
    });
    assertEquals(both.new_followers, 9);
  });

  await t.step("Facebook and Instagram follows add up", () => {
    const row = profileTrafficRow({
      actions: [action("like", 12), action("instagram_profile_follow", 7)],
    });
    assertEquals(row.new_followers, 19);
  });

  await t.step("a follow repeated in conversions is counted once", () => {
    const row = profileTrafficRow({
      actions: [action("like", 12)],
      conversions: [action("like", 12)],
    });
    assertEquals(row.new_followers, 12);
  });

  await t.step("page engagement alone is not a follower", () => {
    const row = profileTrafficRow({
      actions: [action("page_engagement", 40), action("link_click", 30)],
    });
    assertEquals(row.new_followers, 0);
  });

  await t.step("a row without actions has no followers", () => {
    assertEquals(profileTrafficRow({}).new_followers, 0);
  });
});

Deno.test("countNewFollowers", async (t) => {
  await t.step("reads only the follow action types", () => {
    const counts: Record<string, number> = {
      like: 3,
      instagram_profile_follow_v2: 2,
      page_engagement: 50,
    };
    const countOf = (types: string[]) =>
      types.reduce((sum, type) => sum + (counts[type] ?? 0), 0);
    assertEquals(countNewFollowers(countOf), 5);
  });
});
