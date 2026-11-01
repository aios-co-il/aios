import { assertStrictEquals } from "jsr:@std/assert@1";
import { campaignGoalOverride } from "./campaign-goal-override.ts";

Deno.test("campaignGoalOverride", async (t) => {
  await t.step("reads the goal by campaign id, then by trimmed name", () => {
    const settings = {
      pulse_campaign_goals: { "77": " Leads ", PMax: "ecommerce" },
    };
    assertStrictEquals(
      campaignGoalOverride({ campaign_id: "77" }, settings),
      "leads",
    );
    assertStrictEquals(
      campaignGoalOverride(
        { campaign_id: "8", campaign_name: " PMax " },
        settings,
      ),
      "ecommerce",
    );
  });

  await t.step("a numeric campaign id reads the same key", () => {
    assertStrictEquals(
      campaignGoalOverride(
        { campaignId: 77 },
        { pulse_campaign_goals: { "77": "leads" } },
      ),
      "leads",
    );
  });

  await t.step("no overrides, no match or a non-string goal give ''", () => {
    assertStrictEquals(campaignGoalOverride({ campaign_id: "1" }, {}), "");
    assertStrictEquals(
      campaignGoalOverride(
        { campaign_id: "1" },
        { pulse_campaign_goals: "leads" },
      ),
      "",
    );
    assertStrictEquals(
      campaignGoalOverride(
        { campaign_id: "1" },
        { pulse_campaign_goals: { "1": 2 } },
      ),
      "",
    );
  });
});
