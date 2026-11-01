import { assertEquals } from "jsr:@std/assert@1";
import {
  classifyGoogleCampaignGoal,
  type GoogleGoalHints,
} from "./google-campaign-goal.ts";

const noHints: GoogleGoalHints = {
  legacyGoal: null,
  nameGoal: null,
  reportIsEcommerce: false,
};

Deno.test("classifyGoogleCampaignGoal", async (t) => {
  await t.step("the stamped conversion goal beats every hint", () => {
    assertEquals(
      classifyGoogleCampaignGoal(
        { conversion_goal: " Ecommerce ", purchases: 0 },
        { legacyGoal: "leads", nameGoal: "leads", reportIsEcommerce: false },
      ),
      { goal: "ecommerce", source: "platform_goal" },
    );
  });

  await t.step("a non-string conversion goal is ignored", () => {
    assertEquals(classifyGoogleCampaignGoal({ conversion_goal: 1 }, noHints), {
      goal: "leads",
      source: "table_report_type",
    });
  });

  await t.step("legacy rows: the row type, then purchases", () => {
    assertEquals(
      classifyGoogleCampaignGoal({}, { ...noHints, legacyGoal: "leads" }),
      { goal: "leads", source: "explicit_mapping" },
    );
    assertEquals(
      classifyGoogleCampaignGoal(
        { purchases: 0 },
        { ...noHints, legacyGoal: "engagement" },
      ),
      { goal: "ecommerce", source: "explicit_mapping" },
    );
  });

  await t.step("a Shopping campaign is ecommerce before its name", () => {
    assertEquals(
      classifyGoogleCampaignGoal(
        { campaign_channel_type: "shopping" },
        { ...noHints, nameGoal: "leads" },
      ),
      { goal: "ecommerce", source: "platform_goal" },
    );
  });

  await t.step("the name, then the report type", () => {
    assertEquals(
      classifyGoogleCampaignGoal({}, { ...noHints, nameGoal: "engagement" }),
      { goal: "engagement", source: "explicit_mapping" },
    );
    assertEquals(
      classifyGoogleCampaignGoal({}, { ...noHints, reportIsEcommerce: true }),
      { goal: "ecommerce", source: "table_report_type" },
    );
  });
});
