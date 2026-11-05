import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { buildPulseAttentionRows } from "./pulse-attention-matrix.mjs";
import { resolvePulseTargetAcross } from "./pulse/targets/resolve.ts";
import {
  ALERTS_ON,
  LEAD,
  attentionClient,
  campaignDays,
  leadsTable,
  onlyRow,
} from "./pulse/test-fixtures.ts";

/** One lead campaign with spend, CPL 100 against a baseline of 50. */
const leadRow = (tableId: string) => ({
  client_id: "a",
  table_id: tableId,
  platform: "meta",
  goal: "leads",
  campaign_name: "Leads",
  spend_7d: 700,
  outcomes_7d: 7,
  efficiency_7d: 100,
  baseline_efficiency_7d: 50,
  trend_7d_pct: 100,
  status: "warning",
  status_tier: "watch",
  status_reason: "מגמה מתמשכת למעקב",
  alert_eligible: false,
  last_change_at: new Date().toISOString(),
});

Deno.test("the attention row reads the platform target from the table", () => {
  const [row] = buildPulseAttentionRows({
    campaignRows: [leadRow("t1")],
    tables: [
      leadsTable("t1", "a", { pulse_platform_targets: { leads: { cpl: 90 } } }),
    ],
    clients: [attentionClient("a")],
  });
  assertStrictEquals(row.target?.value, 90);
  assertStrictEquals(row.target?.source, "approved");
});

Deno.test(
  "the attention row never treats the 30-day baseline as a target",
  () => {
    const [row] = buildPulseAttentionRows({
      campaignRows: [leadRow("t1")],
      tables: [leadsTable("t1", "a")],
      clients: [attentionClient("a")],
    });
    assertStrictEquals(row.target, null);
    assertStrictEquals(row.baselineEfficiency7d, 50);
  },
);

Deno.test(
  "duplicate tables with tied targets: pulse row, attention matrix and editor show the same one",
  () => {
    const records = [
      ...campaignDays({
        tableId: "t-b",
        campaignId: "c1",
        name: "Leads",
        extra: LEAD,
        baseline: { spend: 100, leads: 2 },
        current: { spend: 150, leads: 2 }, // CPL 75
      }),
      ...campaignDays({
        tableId: "t-a",
        campaignId: "c2",
        name: "Leads",
        extra: LEAD,
        baseline: { spend: 100, leads: 2 },
        current: { spend: 150, leads: 2 },
      }),
    ];
    // Legacy table CPL on both tables: same source, same level, no set_at.
    const tb = leadsTable("t-b", "a", { target_cpl: 80 });
    const ta = leadsTable("t-a", "a", { target_cpl: 60 });
    for (const tables of [
      [tb, ta],
      [ta, tb],
    ]) {
      const row = onlyRow(records, tables, ALERTS_ON);
      assertStrictEquals(row.target_value, 60);
      assertStrictEquals(row.target_table_id, "t-a");
      assertEquals(row.read_table_ids, ["t-a", "t-b"]);

      const [attention] = buildPulseAttentionRows({
        campaignRows: [row],
        tables,
        clients: [attentionClient("a")],
      });
      assertStrictEquals(attention.target?.value, 60);
      assertStrictEquals(attention.target?.table_id, "t-a");

      // The editor reads the platform target from its own list of table ids.
      const byId = new Map(tables.map((t) => [t.id, t.integration_settings]));
      for (const tableIds of [
        ["t-b", "t-a"],
        ["t-a", "t-b"],
      ]) {
        const editor = resolvePulseTargetAcross(
          tableIds.map((tableId) => ({ tableId, settings: byId.get(tableId) })),
          "leads",
        );
        assertStrictEquals(editor?.value, 60);
        assertStrictEquals(editor?.table_id, "t-a");
      }
    }
  },
);

Deno.test(
  "duplicate Meta tables of both types with tied targets: every caller prefers the goal's table",
  () => {
    const days = (tableId: string) =>
      campaignDays({
        tableId,
        campaignId: "c1",
        name: "Leads",
        extra: LEAD,
        baseline: { spend: 100, leads: 2 },
        current: { spend: 200, leads: 2 }, // CPL 100, above both targets
      });
    const records = [...days("t-a"), ...days("t-b")];
    // The lower table id is the ecommerce table; a lead campaign reads best from
    // the insights table, so its legacy CPL applies.
    const ta = {
      ...leadsTable("t-a", "a", { target_cpl: 60 }),
      integration_type: "facebook_ecommerce",
    };
    const tb = leadsTable("t-b", "a", { target_cpl: 80 });
    for (const tables of [
      [ta, tb],
      [tb, ta],
    ]) {
      const row = onlyRow(records, tables, ALERTS_ON);
      assertStrictEquals(row.goal, "leads");
      assertStrictEquals(row.table_id, "t-b");
      assertStrictEquals(row.target_value, 80);
      assertStrictEquals(row.target_table_id, "t-b");

      const [attention] = buildPulseAttentionRows({
        campaignRows: [row],
        tables,
        clients: [attentionClient("a")],
      });
      assertStrictEquals(attention.target?.value, 80);
      assertStrictEquals(attention.target?.table_id, "t-b");

      const byId = new Map(tables.map((t) => [t.id, t]));
      for (const tableIds of [
        ["t-a", "t-b"],
        ["t-b", "t-a"],
      ]) {
        const editor = resolvePulseTargetAcross(
          tableIds.map((tableId) => ({
            tableId,
            integrationType: byId.get(tableId)?.integration_type,
            settings: byId.get(tableId)?.integration_settings,
          })),
          "leads",
        );
        assertStrictEquals(editor?.value, 80);
        assertStrictEquals(editor?.table_id, "t-b");
      }
    }
  },
);
