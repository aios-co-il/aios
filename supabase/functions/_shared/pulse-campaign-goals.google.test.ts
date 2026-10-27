import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  buildPulseCampaignRows,
  classifyPulseCampaignGoal,
  googleReportCampaignGoals,
  pulseCampaignOutcome,
} from "./pulse-campaign-goals.mjs";

// Real Google Ads sync rows: `cost`, `conversions`, `conversions_value` — no spend,
// purchases, objective or campaign_type.
const googleTable = (
  id: string,
  settings: Record<string, unknown> = {},
  category = "Google Ads",
) => ({
  id,
  client_id: "c1",
  integration_type: "google_ads",
  integration_settings: settings,
  category,
});
const googleRow = (
  table_id: string,
  date: string,
  data: Record<string, unknown>,
) => ({
  table_id,
  data: { date, entity_level: "campaign", ...data },
});
const lastWeek = [
  "2026-10-17",
  "2026-10-18",
  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
];

Deno.test("google lead campaign with valued conversions stays leads", () => {
  const goal = classifyPulseCampaignGoal(
    {
      campaign_name: "PMax כללי",
      cost: 100,
      conversions: 3,
      conversions_value: 3,
    },
    googleTable("g", { campaign_type: "leads" }),
  );
  assertStrictEquals(goal.goal, "leads");
});

Deno.test("google ecommerce campaign counts conversions as purchases", () => {
  const data = {
    campaign_name: "PMax",
    cost: 100,
    conversions: 2,
    conversions_value: 600,
  };
  const goal = classifyPulseCampaignGoal(
    data,
    googleTable("g", { campaign_type: "ecommerce" }, "איקומרס"),
  );
  assertStrictEquals(goal.goal, "ecommerce");
  assertEquals(pulseCampaignOutcome(data, "ecommerce"), {
    value: 2,
    field: "conversions",
    kind: "purchases",
  });
});

Deno.test(
  "google clicks-only day keeps the report goal instead of engagement",
  () => {
    const goal = classifyPulseCampaignGoal(
      {
        campaign_name: "PMax",
        cost: 20,
        clicks: 30,
        conversions: 0,
        conversions_value: 0,
      },
      googleTable("g", { campaign_type: "ecommerce" }, "איקומרס"),
    );
    assertStrictEquals(goal.goal, "ecommerce");
  },
);

Deno.test("google conversion_goal from the sync beats the report type", () => {
  const goal = classifyPulseCampaignGoal(
    {
      campaign_name: "PMax",
      conversion_goal: "ecommerce",
      cost: 50,
      conversions: 1,
    },
    googleTable("g", { campaign_type: "leads" }),
  );
  assertEquals(goal, { goal: "ecommerce", source: "platform_goal" });
});

Deno.test("a manual per-campaign goal beats every other signal", () => {
  const goal = classifyPulseCampaignGoal(
    { campaign_id: "77", campaign_name: "PMax", conversion_goal: "ecommerce" },
    googleTable("g", { pulse_campaign_goals: { 77: "leads" } }),
  );
  assertEquals(goal, { goal: "leads", source: "explicit_mapping" });
});

Deno.test(
  "google ecommerce PMax with quiet days is one ecommerce campaign with its sales",
  () => {
    const records = lastWeek.map((date, i) =>
      googleRow("e", date, {
        campaign_id: "1",
        campaign_name: "PMax",
        cost: i < 5 ? 20 : 500,
        clicks: 30,
        conversions: i < 5 ? 0 : 3,
        conversions_value: i < 5 ? 0 : 900,
      }),
    );
    const rows = buildPulseCampaignRows({
      records,
      tables: [googleTable("e", { campaign_type: "ecommerce" }, "איקומרס")],
      nowYmd: "2026-10-24",
    });
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0].goal, "ecommerce");
    assertStrictEquals(rows[0].outcome_kind, "purchases");
    assertStrictEquals(rows[0].outcomes_7d, 6);
    assertStrictEquals(rows[0].revenue_7d, 1800);
    assertStrictEquals(rows[0].spend_7d, 1100);
  },
);

Deno.test(
  "one google account can hold an ecommerce PMax and a lead Search campaign",
  () => {
    const records = lastWeek.flatMap((date) => [
      googleRow("g", date, {
        campaign_id: "pmax",
        campaign_name: "PMax",
        campaign_channel_type: "PERFORMANCE_MAX",
        conversion_goal: "ecommerce",
        cost: 100,
        conversions: 1,
        conversions_value: 400,
      }),
      googleRow("g", date, {
        campaign_id: "search",
        campaign_name: "Search",
        campaign_channel_type: "SEARCH",
        conversion_goal: "leads",
        cost: 50,
        conversions: 2,
        conversions_value: 2,
      }),
    ]);
    const rows = buildPulseCampaignRows({
      records,
      tables: [googleTable("g", { campaign_type: "leads" })],
      nowYmd: "2026-10-24",
    });
    const byId = Object.fromEntries(rows.map((row) => [row.campaign_id, row]));
    assertStrictEquals(byId.pmax.goal, "ecommerce");
    assertStrictEquals(byId.pmax.outcomes_7d, 7);
    assertStrictEquals(byId.search.goal, "leads");
    assertStrictEquals(byId.search.outcomes_7d, 14);
  },
);

Deno.test(
  "rows synced before the goal was stamped do not outvote the stamped rows",
  () => {
    const records = lastWeek.map((date, i) =>
      googleRow("g", date, {
        campaign_id: "pmax",
        campaign_name: "PMax",
        cost: i < 5 ? 500 : 20,
        conversions: 1,
        ...(i >= 5 ? { conversion_goal: "ecommerce" } : {}),
      }),
    );
    const rows = buildPulseCampaignRows({
      records,
      tables: [googleTable("g", { campaign_type: "leads" })],
      nowYmd: "2026-10-24",
    });
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0].goal, "ecommerce");
  },
);

Deno.test("reports get each Google campaign's own goal", () => {
  const records = lastWeek.flatMap((date) => [
    googleRow("g", date, {
      campaign_id: "pmax-shop",
      campaign_name: "PMax חנות",
      conversion_goal: "ecommerce",
      cost: 100,
    }),
    googleRow("g", date, {
      campaign_id: "pmax-leads",
      campaign_name: "PMax כללי",
      conversion_goal: "leads",
      cost: 100,
      conversions_value: 5,
    }),
    googleRow("g", date, {
      campaign_id: "search",
      campaign_name: "Search",
      cost: 50,
    }),
  ]);
  const goals = googleReportCampaignGoals({
    records,
    tables: [googleTable("g", { campaign_type: "ecommerce" }, "איקומרס")],
  });
  assertStrictEquals(goals.get("pmax-shop"), "ecommerce");
  assertStrictEquals(goals.get("pmax-leads"), "leads");
  assertStrictEquals(goals.get("search"), "ecommerce");
});
