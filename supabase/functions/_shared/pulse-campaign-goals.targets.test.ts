import {
  assertEquals,
  assertMatch,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { listCampaignsWithoutTarget } from "./pulse/targets/missing.ts";
import {
  ALERTS_ON,
  LEAD,
  campaignDays,
  leadsTable,
  onlyRow,
} from "./pulse/test-fixtures.ts";

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
    // Yellow while target-less alerts are off: red means an alert is due.
    assertStrictEquals(off.status, "warning");
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
    assertStrictEquals(on.status, "critical");
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
    const sale = (current: Record<string, unknown>) =>
      onlyRow(
        campaignDays({
          tableId: "t9",
          campaignId: "p1",
          name: "Sale",
          extra: {
            campaign_type: "ecommerce",
            campaign_objective: "OUTCOME_SALES",
          },
          baseline: { spend: 100, purchases: 2, purchase_value: 400 }, // ROAS 4
          current,
        }),
        [shop],
        ALERTS_ON,
      );
    const drop30 = sale({ spend: 100, purchases: 2, purchase_value: 280 }); // ROAS 2.8
    assertStrictEquals(drop30.goal, "ecommerce");
    assertStrictEquals(drop30.trend_7d_pct, 30);
    assertStrictEquals(drop30.status_tier, "exception");
    assertStrictEquals(drop30.alert_eligible, true);
    assertMatch(drop30.status_reason, /ROAS/);

    const drop20 = sale({ spend: 100, purchases: 2, purchase_value: 320 });
    assertStrictEquals(drop20.alert_eligible, false);
    assertNotStrictEquals(drop20.status_tier, "exception");
  },
);

Deno.test(
  "duplicate Meta tables: the campaign's target and verdict do not depend on record order",
  () => {
    const t1 = campaignDays({
      tableId: "t1",
      campaignId: "c1",
      name: "Leads",
      extra: LEAD,
      baseline: { spend: 100, leads: 2 }, // CPL 50
      current: { spend: 150, leads: 2 }, // CPL 75
    });
    const t2 = campaignDays({
      tableId: "t2",
      campaignId: "c2",
      name: "Leads",
      extra: LEAD,
      baseline: { spend: 100, leads: 2 },
      current: { spend: 150, leads: 2 },
    });
    // The editor saved an approved per-campaign CPL 60 on t1 under c1.
    const tables = [
      leadsTable("t1", "a", { pulse_targets: { c1: { cpl: 60 } } }),
      leadsTable("t2", "a"),
    ];
    const seen = [];
    for (const records of [
      [...t1, ...t2],
      [...t2, ...t1],
    ]) {
      const row = onlyRow(records, tables, ALERTS_ON);
      assertStrictEquals(row.target_value, 60);
      assertStrictEquals(row.target_source, "approved");
      assertStrictEquals(row.target_table_id, "t1");
      assertMatch(row.status_reason, /היעד המאושר \(CPL 60\)/);
      assertStrictEquals(row.alert_eligible, true);
      assertStrictEquals(row.spend_7d, 1050, "one table's rows per day");
      assertEquals(
        listCampaignsWithoutTarget({ campaignRows: [row], tables }),
        [],
      );
      seen.push([row.table_id, row.campaign_id, row.status_reason]);
    }
    assertEquals(seen[0], seen[1]);
  },
);
