import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  classifyGoogleCampaignGoal,
  classifyGoogleCampaignRow,
  type GoogleGoalHints,
} from "./google-classify.ts";

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

// Real Google Ads sync rows: `cost`, `conversions`, `conversions_value` — no spend,
// purchases, objective or campaign_type.
const googleTable = (
  settings: Record<string, unknown> = {},
  category = "Google Ads",
) => ({
  integration_type: "google_ads",
  integration_settings: settings,
  category,
});

Deno.test("classifyGoogleCampaignRow", async (t) => {
  await t.step("a lead campaign with valued conversions stays leads", () => {
    const verdict = classifyGoogleCampaignRow(
      {
        campaign_name: "PMax כללי",
        cost: 100,
        conversions: 3,
        conversions_value: 3,
      },
      googleTable({ campaign_type: "leads" }),
    );
    assertStrictEquals(verdict.goal, "leads");
  });

  await t.step("a clicks-only day keeps the report goal", () => {
    const verdict = classifyGoogleCampaignRow(
      {
        campaign_name: "PMax",
        cost: 20,
        clicks: 30,
        conversions: 0,
        conversions_value: 0,
      },
      googleTable({ campaign_type: "ecommerce" }, "איקומרס"),
    );
    assertStrictEquals(verdict.goal, "ecommerce");
  });

  await t.step("the sync's conversion_goal beats the report type", () => {
    const verdict = classifyGoogleCampaignRow(
      {
        campaign_name: "PMax",
        conversion_goal: "ecommerce",
        cost: 50,
        conversions: 1,
      },
      googleTable({ campaign_type: "leads" }),
    );
    assertEquals(verdict, { goal: "ecommerce", source: "platform_goal" });
  });

  await t.step("a manual per-campaign goal beats every other signal", () => {
    const verdict = classifyGoogleCampaignRow(
      {
        campaign_id: "77",
        campaign_name: "PMax",
        conversion_goal: "ecommerce",
      },
      googleTable({ pulse_campaign_goals: { 77: "leads" } }),
    );
    assertEquals(verdict, { goal: "leads", source: "explicit_mapping" });
  });
});

Deno.test(
  "a Google campaign set to pay for exposure is traffic (AIO-496)",
  async (t) => {
    await t.step(
      "Display on manual CPM is traffic, whatever it converts on",
      () => {
        // גוטשטיין קרמיקה "מדיה" on Production, 2026-11-07.
        assertEquals(
          classifyGoogleCampaignGoal(
            {
              campaign_name: "מדיה",
              campaign_channel_type: "DISPLAY",
              bidding_strategy_type: "MANUAL_CPM",
              conversion_goal: "leads",
            },
            noHints,
          ),
          { goal: "traffic", source: "platform_goal" },
        );
      },
    );

    await t.step("Display on Maximize Conversions keeps its goal", () => {
      // סטודיו נושקה "תעודת זהות".
      assertEquals(
        classifyGoogleCampaignGoal(
          {
            campaign_name: "תעודת זהות",
            campaign_channel_type: "DISPLAY",
            bidding_strategy_type: "MAXIMIZE_CONVERSIONS",
          },
          noHints,
        ).goal,
        "leads",
      );
    });

    await t.step("Video on CPV and Demand Gen on clicks are traffic", () => {
      for (const data of [
        { campaign_channel_type: "VIDEO", bidding_strategy_type: "TARGET_CPV" },
        {
          campaign_channel_type: "DEMAND_GEN",
          bidding_strategy_type: "MAXIMIZE_CLICKS",
        },
      ]) {
        assertStrictEquals(
          classifyGoogleCampaignGoal(data, noHints).goal,
          "traffic",
        );
      }
    });

    await t.step(
      "a Search campaign on manual CPC stays on its conversion goal",
      () => {
        assertStrictEquals(
          classifyGoogleCampaignGoal(
            {
              campaign_channel_type: "SEARCH",
              bidding_strategy_type: "MANUAL_CPC",
            },
            noHints,
          ).goal,
          "leads",
        );
      },
    );

    await t.step("a manual per-campaign goal still wins", () => {
      assertEquals(
        classifyGoogleCampaignRow(
          {
            campaign_id: "88",
            campaign_channel_type: "DISPLAY",
            bidding_strategy_type: "MANUAL_CPM",
          },
          {
            integration_type: "google_ads",
            integration_settings: { pulse_campaign_goals: { 88: "leads" } },
          },
        ),
        { goal: "leads", source: "explicit_mapping" },
      );
    });
  },
);
