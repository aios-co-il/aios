import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { listCampaignsWithoutTarget } from "./missing.ts";

Deno.test(
  "campaigns with spend and no target of any source are listed per platform",
  () => {
    const tables = [
      {
        id: "t1",
        client_id: "a",
        integration_settings: { pulse_targets: { c2: { cpl: 50 } } },
      },
      {
        id: "t2",
        client_id: "b",
        integration_settings: {
          pulse_platform_targets: {
            ecommerce: { roas: 3, source: "carmen_market" },
          },
        },
      },
    ];
    const row = (over: Record<string, unknown>) => ({
      campaign_key: over.campaign_id,
      client_id: "a",
      table_id: "t1",
      platform: "meta",
      goal: "leads",
      spend_7d: 100,
      delivery_status: "active",
      ...over,
    });
    const groups = listCampaignsWithoutTarget({
      tables,
      campaignRows: [
        row({ campaign_id: "c1", campaign_name: "No target", spend_7d: 400 }),
        row({ campaign_id: "c2", campaign_name: "Approved" }),
        row({ campaign_id: "c3", campaign_name: "No spend", spend_7d: 0 }),
        row({
          campaign_id: "c4",
          campaign_name: "Paused",
          delivery_status: "paused",
        }),
        row({ campaign_id: "c5", campaign_name: "Video", goal: "engagement" }),
        row({
          campaign_id: "c6",
          campaign_name: "Market",
          client_id: "b",
          table_id: "t2",
          goal: "ecommerce",
        }),
        // The pulse found a target on a duplicate table of this campaign.
        row({
          campaign_id: "c7",
          campaign_name: "Duplicate table",
          target_value: 55,
          target_source: "approved",
        }),
      ],
    });
    assertStrictEquals(groups.length, 1);
    assertStrictEquals(groups[0].client_id, "a");
    assertEquals(
      groups[0].campaigns.map((c) => c.campaign_id),
      ["c1"],
    );
    assertStrictEquals(groups[0].spend_7d, 400);
  },
);

Deno.test("a row whose table is not loaded is not listed", () => {
  const groups = listCampaignsWithoutTarget({
    tables: [],
    campaignRows: [
      {
        campaign_key: "k1",
        campaign_id: "c1",
        campaign_name: "Leads",
        client_id: "a",
        table_id: "gone",
        platform: "meta",
        goal: "leads",
        spend_7d: 500,
      },
    ],
  });
  assertEquals(groups, []);
});
