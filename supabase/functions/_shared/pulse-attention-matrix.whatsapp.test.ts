import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { buildPulseAttentionRows } from "./pulse-attention-matrix.mjs";
import { buildPulseCampaignRows } from "./pulse-campaign-goals.mjs";
import { evaluatePulseInstantAlerts } from "./pulse-instant-alerts.ts";
import {
  ALERTS_ON,
  INSTANT_RULES,
  LEAD,
  NOW,
  attentionClient,
  campaignDays,
  leadsTable,
} from "./pulse/test-fixtures.ts";

const CLIENTS = ["a", "b", "c"];

const records = [
  // a: no target, CPL +50%, solid spend and baseline.
  ...campaignDays({
    tableId: "ta",
    campaignId: "a1",
    name: "A leads",
    extra: LEAD,
    baseline: { spend: 100, leads: 2 },
    current: { spend: 150, leads: 2 },
  }),
  // b: Carmen's market target CPL 60, breached on both windows.
  ...campaignDays({
    tableId: "tb",
    campaignId: "b1",
    name: "B leads",
    extra: LEAD,
    baseline: { spend: 100, leads: 2 },
    current: { spend: 150, leads: 2 },
  }),
  // c: no target, CPL +50% but tiny spend.
  ...campaignDays({
    tableId: "tc",
    campaignId: "c1",
    name: "C leads",
    extra: LEAD,
    baseline: { spend: 10, leads: 0.2 },
    current: { spend: 15, leads: 0.2 },
  }),
];

const tables = [
  leadsTable("ta", "a"),
  leadsTable("tb", "b", {
    pulse_platform_targets: {
      leads: { cpl: 60, source: "carmen_market", rationale: "בנצ׳מרק" },
    },
  }),
  leadsTable("tc", "c"),
];

/** Clients the snapshot would alert on WhatsApp under these rules. */
function alertedClients(alertRules: unknown): Set<string> {
  const breakdown = buildPulseCampaignRows({
    records,
    tables,
    nowYmd: NOW,
    alertRules,
  });
  const snapshots = CLIENTS.map((clientId) => ({
    client_id: clientId,
    client_name: clientId,
    campaign_breakdown: breakdown.filter(
      (row: { client_id: string }) => row.client_id === clientId,
    ),
  }));
  return new Set(
    evaluatePulseInstantAlerts(snapshots, [], INSTANT_RULES).map(
      (candidate) => candidate.client_id,
    ),
  );
}

Deno.test(
  "dashboard and snapshot agree: red on the dashboard ⇔ a WhatsApp alert",
  () => {
    for (const alertRules of [null, ALERTS_ON]) {
      const alerted = alertedClients(alertRules);

      // Dashboard side: the same builder (same tenant rules) → attention matrix.
      const attention = buildPulseAttentionRows({
        campaignRows: buildPulseCampaignRows({
          records,
          tables,
          nowYmd: NOW,
          alertRules,
        }),
        tables,
        clients: CLIENTS.map(attentionClient),
      });
      const red = new Set(
        attention
          .filter((row) => row.issues.efficiency?.level === "alert")
          .map((row) => row.clientId),
      );

      assertEquals([...red].sort(), [...alerted].sort());
      assert(alerted.has("b"), "market target alerts in both modes");
      assertStrictEquals(alerted.has("a"), alertRules === ALERTS_ON);
      assert(!alerted.has("c"), "below minimum spend never alerts");

      const b = attention.find((row) => row.clientId === "b");
      assertStrictEquals(b?.target?.source, "carmen_market");
      assertStrictEquals(b?.target?.value, 60);
      const a = attention.find((row) => row.clientId === "a");
      assertStrictEquals(
        a?.target,
        null,
        "no 30-day baseline posing as a target",
      );
      if (alertRules === null) {
        assertStrictEquals(a?.issues.efficiency?.level, "watch");
      }
    }
  },
);
