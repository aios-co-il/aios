import { assertStrictEquals } from "jsr:@std/assert@1";

import { summarizePulseTargets } from "./summary.ts";

Deno.test(
  "summarizePulseTargets lists set targets with source and the missing ones",
  () => {
    const summary = summarizePulseTargets({
      tables: [
        {
          id: "t1",
          client_id: "a",
          integration_type: "facebook_insights",
          integration_settings: {
            pulse_platform_targets: {
              leads: {
                cpl: 70,
                source: "carmen_market",
                rationale: "בנצ׳מרק",
                set_at: "2026-10-26T08:00:00Z",
              },
            },
            pulse_targets: { c2: { cpl: 50, goal: "leads" } },
          },
        },
      ],
      campaignRows: [],
    });
    const client = summary.clients[0];
    assertStrictEquals(client.platform_targets[0].source, "carmen_market");
    assertStrictEquals(
      client.platform_targets[0].set_at,
      "2026-10-26T08:00:00Z",
    );
    assertStrictEquals(client.campaign_targets[0].campaign, "c2");
    assertStrictEquals(client.campaign_targets[0].source, "approved");
    assertStrictEquals(summary.missing_count, 0);
  },
);

Deno.test(
  "a table of no ad platform is skipped; a client with only missing campaigns is listed",
  () => {
    const summary = summarizePulseTargets({
      tables: [
        {
          id: "crm",
          client_id: "a",
          integration_type: "leads_form",
          integration_settings: { target_cpl: 40 },
        },
        { id: "g1", client_id: "b", integration_type: "google_ads" },
      ],
      campaignRows: [
        {
          campaign_key: "k1",
          campaign_id: "c1",
          campaign_name: "Search",
          client_id: "b",
          table_id: "g1",
          platform: "google",
          goal: "leads",
          spend_7d: 250,
        },
      ],
    });
    assertStrictEquals(summary.clients.length, 1);
    assertStrictEquals(summary.clients[0].client_id, "b");
    assertStrictEquals(summary.clients[0].platform_targets.length, 0);
    assertStrictEquals(summary.clients[0].missing[0].spend_7d, 250);
    assertStrictEquals(summary.missing_count, 1);
  },
);
