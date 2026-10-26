// AIO-236: campaigns without a target, Carmen's market targets, and the dashboard
// agreeing with what the snapshot alerts on (imports the instant-alert rules
// from pulse-instant-alerts.ts).
import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { buildPulseCampaignRows } from "./pulse-campaign-goals.mjs";
import { buildPulseAttentionRows } from "./pulse-attention-matrix.mjs";
import { evaluatePulseInstantAlerts } from "./pulse-instant-alerts.ts";

const NOW = "2026-09-18"; // current 7d: 09-11..09-17; baseline: 08-14..09-10
const ALERTS_ON = { manager: { cost: { target_less_alerts: true } } };

function day(offset) {
  const date = new Date(Date.UTC(2026, 8, 17) - offset * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/**
 * Daily campaign rows: `baseline` for the 28 baseline days (or fewer), `current`
 * for the last 7 full days.
 */
function campaignDays({
  tableId,
  campaignId,
  name,
  extra = {},
  baseline,
  current,
  baselineDays = 28,
}) {
  const rows = [];
  for (let i = 7; i < 7 + baselineDays; i += 1)
    rows.push({
      table_id: tableId,
      data: {
        date: day(i),
        campaign_id: campaignId,
        campaign_name: name,
        ...extra,
        ...baseline,
      },
    });
  for (let i = 0; i < 7; i += 1)
    rows.push({
      table_id: tableId,
      data: {
        date: day(i),
        campaign_id: campaignId,
        campaign_name: name,
        ...extra,
        ...current,
      },
    });
  return rows;
}

const leadsTable = (id, clientId, settings = {}) => ({
  id,
  client_id: clientId,
  integration_type: "facebook_insights",
  integration_settings: settings,
});

const LEAD = { campaign_type: "lead", campaign_objective: "OUTCOME_LEADS" };

function onlyRow(records, tables, alertRules) {
  const rows = buildPulseCampaignRows({
    records,
    tables,
    nowYmd: NOW,
    alertRules,
  });
  assertStrictEquals(rows.length, 1);
  return rows[0];
}

Deno.test(
  "no target: CPL +50% on 3d and 7d with spend and baseline is an exception",
  () => {
    const records = campaignDays({
      tableId: "t1",
      campaignId: "c1",
      name: "Leads",
      extra: LEAD,
      baseline: { spend: 100, leads: 2 }, // CPL 50
      current: { spend: 150, leads: 2 }, // CPL 75
    });
    const tables = [leadsTable("t1", "a")];

    const off = onlyRow(records, tables, null);
    assertStrictEquals(off.trend_3d_pct, 50);
    assertStrictEquals(off.trend_7d_pct, 50);
    assertStrictEquals(off.status, "critical");
    assertStrictEquals(off.status_tier, "exception");
    assertStrictEquals(
      off.alert_eligible,
      false,
      "ships off: no burst on deploy",
    );
    assertStrictEquals(off.target_value, null);
    assertStrictEquals(off.baseline_days, 28);
    assertStrictEquals(off.baseline_outcomes, 56);

    const on = onlyRow(records, tables, ALERTS_ON);
    assertStrictEquals(on.alert_eligible, true);
    assertStrictEquals(
      on.status_reason,
      off.status_reason,
      "stable fingerprint text",
    );
    assertMatch(on.status_reason, /CPL/);
  },
);

Deno.test(
  "no target: CPL +30% stays watch; a tenant threshold of 60% keeps +50% at watch",
  () => {
    const plus30 = onlyRow(
      campaignDays({
        tableId: "t1",
        campaignId: "c1",
        name: "Leads",
        extra: LEAD,
        baseline: { spend: 100, leads: 2 },
        current: { spend: 130, leads: 2 },
      }),
      [leadsTable("t1", "a")],
      ALERTS_ON,
    );
    assertStrictEquals(plus30.status_tier, "watch");
    assertStrictEquals(plus30.alert_eligible, false);

    const strict = onlyRow(
      campaignDays({
        tableId: "t1",
        campaignId: "c1",
        name: "Leads",
        extra: LEAD,
        baseline: { spend: 100, leads: 2 },
        current: { spend: 150, leads: 2 },
      }),
      [leadsTable("t1", "a")],
      { manager: { cost: { trend_pct: 60, target_less_alerts: true } } },
    );
    assertStrictEquals(strict.status_tier, "watch");
    assertStrictEquals(strict.alert_eligible, false);
  },
);

Deno.test("no target: spend under ₪300 in 7 days does not alert", () => {
  const row = onlyRow(
    campaignDays({
      tableId: "t1",
      campaignId: "c1",
      name: "Leads",
      extra: LEAD,
      baseline: { spend: 10, leads: 0.2 }, // CPL 50
      current: { spend: 15, leads: 0.2 }, // CPL 75, 7d spend 105
    }),
    [leadsTable("t1", "a")],
    ALERTS_ON,
  );
  assertStrictEquals(row.trend_7d_pct, 50);
  assertStrictEquals(row.status_tier, "watch");
  assertStrictEquals(row.alert_eligible, false);
  assertMatch(row.status_reason, /הוצאה מתחת ל־300/);
});

Deno.test("no target: a baseline of a few days does not alert", () => {
  const row = onlyRow(
    campaignDays({
      tableId: "t1",
      campaignId: "c1",
      name: "Leads",
      extra: LEAD,
      baseline: { spend: 100, leads: 2 },
      current: { spend: 150, leads: 2 },
      baselineDays: 7,
    }),
    [leadsTable("t1", "a")],
    ALERTS_ON,
  );
  assertStrictEquals(row.baseline_days, 7);
  assertStrictEquals(row.status_tier, "watch");
  assertStrictEquals(row.alert_eligible, false);
  assertMatch(row.status_reason, /בסיס השוואה קצר/);
});

Deno.test(
  "no target: ROAS down 30% on both windows alerts; down 20% does not",
  () => {
    const shop = {
      id: "t9",
      client_id: "s",
      integration_type: "facebook_ecommerce",
      integration_settings: {},
    };
    const ecommerce = {
      campaign_type: "ecommerce",
      campaign_objective: "OUTCOME_SALES",
    };
    const drop30 = onlyRow(
      campaignDays({
        tableId: "t9",
        campaignId: "p1",
        name: "Sale",
        extra: ecommerce,
        baseline: { spend: 100, purchases: 2, purchase_value: 400 }, // ROAS 4
        current: { spend: 100, purchases: 2, purchase_value: 280 }, // ROAS 2.8
      }),
      [shop],
      ALERTS_ON,
    );
    assertStrictEquals(drop30.goal, "ecommerce");
    assertStrictEquals(drop30.trend_7d_pct, 30);
    assertStrictEquals(drop30.status_tier, "exception");
    assertStrictEquals(drop30.alert_eligible, true);
    assertMatch(drop30.status_reason, /ROAS/);

    const drop20 = onlyRow(
      campaignDays({
        tableId: "t9",
        campaignId: "p1",
        name: "Sale",
        extra: ecommerce,
        baseline: { spend: 100, purchases: 2, purchase_value: 400 },
        current: { spend: 100, purchases: 2, purchase_value: 320 },
      }),
      [shop],
      ALERTS_ON,
    );
    assertStrictEquals(drop20.alert_eligible, false);
    assertNotStrictEquals(drop20.status_tier, "exception");
  },
);

Deno.test(
  "a carmen_market target alerts like an approved one and says it is Carmen's",
  () => {
    const records = campaignDays({
      tableId: "t1",
      campaignId: "c1",
      name: "Leads",
      extra: LEAD,
      baseline: { spend: 100, leads: 2 },
      current: { spend: 150, leads: 2 }, // CPL 75
    });
    const market = onlyRow(
      records,
      [
        leadsTable("t1", "a", {
          pulse_platform_targets: {
            leads: {
              cpl: 60,
              source: "carmen_market",
              rationale: "ענף שיפוצים בישראל ₪50–70 לליד; ממוצע הלקוח ₪50",
            },
          },
        }),
      ],
      null, // target-less alerts off: a market target still alerts
    );
    assertStrictEquals(market.status, "critical");
    assertStrictEquals(market.alert_eligible, true);
    assertStrictEquals(market.target_source, "carmen_market");
    assertMatch(market.status_reason, /יעד שוק \(כרמן\)/);

    const [candidate] = evaluatePulseInstantAlerts(
      [
        {
          client_id: "a",
          client_name: "שיפוצי אבי",
          campaign_breakdown: [market],
        },
      ],
      [],
      {
        instant_wa_enabled: true,
        no_contact_enabled: false,
        cpl_spike_enabled: false,
        disconnected_enabled: false,
      },
    );
    assertStrictEquals(candidate.rule_type, "campaign_exception");
    assertMatch(candidate.message, /יעד: CPL 60 · יעד שוק \(כרמן\)/);
    assertStrictEquals(candidate.evidence.target_source, "carmen_market");

    const approved = onlyRow(
      records,
      [
        leadsTable("t1", "a", {
          pulse_platform_targets: { leads: { cpl: 60 } },
        }),
      ],
      null,
    );
    assertStrictEquals(approved.target_source, "approved");
    assertMatch(approved.status_reason, /היעד המאושר/);
    assertNotMatch(approved.status_reason, /כרמן/);
  },
);

Deno.test(
  "dashboard and snapshot agree: red on the dashboard ⇔ a WhatsApp alert",
  () => {
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
    const clients = ["a", "b", "c"].map((clientId) => ({
      clientId,
      clientName: clientId,
      campaignerName: "דנה",
      moodStatus: "happy",
      lastClientCallAt: null,
      daysSinceLastCommunication: 1,
      recentCommunicationStatus: null,
      hasRecentComplaintUpdate: false,
    }));
    const rules = {
      instant_wa_enabled: true,
      no_contact_enabled: false,
      cpl_spike_enabled: false,
      disconnected_enabled: false,
    };

    for (const alertRules of [null, ALERTS_ON]) {
      // Snapshot side: campaign_breakdown per client → instant alert candidates.
      const breakdown = buildPulseCampaignRows({
        records,
        tables,
        nowYmd: NOW,
        alertRules,
      });
      const snapshots = ["a", "b", "c"].map((clientId) => ({
        client_id: clientId,
        client_name: clientId,
        campaign_breakdown: breakdown.filter(
          (row) => row.client_id === clientId,
        ),
      }));
      const alerted = new Set(
        evaluatePulseInstantAlerts(snapshots, [], rules).map(
          (c) => c.client_id,
        ),
      );

      // Dashboard side: the same builder (same tenant rules) → attention matrix.
      const dashboardRows = buildPulseCampaignRows({
        records,
        tables,
        nowYmd: NOW,
        alertRules,
      });
      const attention = buildPulseAttentionRows({
        campaignRows: dashboardRows,
        tables,
        clients,
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
      assertStrictEquals(b.target.source, "carmen_market");
      assertStrictEquals(b.target.value, 60);
      const a = attention.find((row) => row.clientId === "a");
      assertStrictEquals(
        a.target,
        null,
        "no 30-day baseline posing as a target",
      );
      if (alertRules === null)
        assertStrictEquals(a.issues.efficiency.level, "watch");
    }
  },
);
