import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  addCampaignPlace,
  campaignPlaces,
  campaignTarget,
  campaignTargetFields,
  compareCampaignItems,
  type CampaignPlace,
} from "./campaign-target.ts";

const insights = {
  id: "t-b",
  integration_type: "facebook_insights",
  integration_settings: { target_cpl: 80 },
};
const shop = {
  id: "t-a",
  integration_type: "facebook_ecommerce",
  integration_settings: { pulse_targets: { c1: { cpl: 60, goal: "leads" } } },
};

Deno.test("a campaign's places are kept once per table, id and name", () => {
  const byCampaign = new Map<string, Map<string, CampaignPlace>>();
  const first = { table: insights, identity: { id: "c1", name: "Leads" } };
  addCampaignPlace(byCampaign, "k", first);
  addCampaignPlace(byCampaign, "k", {
    table: insights,
    identity: { id: "c1", name: "Leads" },
  });
  addCampaignPlace(byCampaign, "k", {
    table: shop,
    identity: { id: "c1", name: "Leads" },
  });
  const places = campaignPlaces(byCampaign, "k");
  assertStrictEquals(places.length, 2);
  assertStrictEquals(places[0], first);
  assertEquals(campaignPlaces(byCampaign, "other"), []);
});

Deno.test(
  "the campaign target is resolved over every place and fills the row's columns",
  () => {
    const places = [
      { table: insights, identity: { id: "c9", name: "Leads" } },
      { table: shop, identity: { id: "c1", name: "ללא שם" } },
    ];
    const target = campaignTarget(places, "leads");
    assertStrictEquals(target?.value, 60);
    assertEquals(campaignTargetFields(target, places), {
      target_value: 60,
      target_kind: "cpl",
      target_source: "approved",
      target_scope: "campaign",
      target_table_id: "t-a",
      target_campaign_id: "c1",
      target_rationale: null,
      read_table_ids: ["t-a", "t-b"],
    });
    assertEquals(campaignTargetFields(null, []), {
      target_value: null,
      target_kind: null,
      target_source: null,
      target_scope: null,
      target_table_id: null,
      target_campaign_id: null,
      target_rationale: null,
      read_table_ids: [],
    });
  },
);

Deno.test(
  "a campaign's sample row: best score, then the goal's table, then table id",
  () => {
    const item = (
      table: typeof shop | typeof insights,
      score: number,
      date = "2026-09-17",
    ) => ({
      table,
      score,
      identity: { id: "c1", name: "Leads" },
      record: { data: { date } },
    });
    assertStrictEquals(
      compareCampaignItems(item(shop, 12), item(insights, 10), "leads") < 0,
      true,
    );
    assertStrictEquals(
      compareCampaignItems(item(insights, 10), item(shop, 10), "leads") < 0,
      true,
    );
    assertStrictEquals(
      compareCampaignItems(item(shop, 10), item(insights, 10), "ecommerce") < 0,
      true,
    );
    assertStrictEquals(
      compareCampaignItems(
        item(shop, 10, "2026-09-17"),
        item(shop, 10, "2026-09-16"),
        "leads",
      ) < 0,
      true,
    );
  },
);
