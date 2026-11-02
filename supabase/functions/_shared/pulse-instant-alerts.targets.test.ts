import {
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { evaluatePulseInstantAlerts } from "./pulse-instant-alerts.ts";
import {
  ALERTS_ON,
  INSTANT_RULES,
  LEAD,
  campaignDays,
  day,
  leadsTable,
  onlyRow,
} from "./pulse/test-fixtures.ts";

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
      INSTANT_RULES,
    );
    assertStrictEquals(candidate.rule_type, "campaign_exception");
    assertMatch(candidate.message, /יעד: CPL 60 · יעד שוק \(כרמן\)/);
    assertStrictEquals(candidate.evidence?.target_source, "carmen_market");

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
  "no target: spend with no leads in the last 3 days counts past the threshold",
  () => {
    const records = campaignDays({
      tableId: "t1",
      campaignId: "c1",
      name: "Leads",
      extra: LEAD,
      baseline: { spend: 100, leads: 2 }, // CPL 50
      current: { spend: 100, leads: 1 }, // CPL 100
    });
    const last3 = [day(0), day(1), day(2)];
    for (const record of records) {
      if (last3.includes(String(record.data.date))) {
        record.data = { ...record.data, leads: 0 };
      }
    }
    const tables = [leadsTable("t1", "a")];

    const row = onlyRow(records, tables, ALERTS_ON);
    assertStrictEquals(row.spend_3d, 300);
    assertStrictEquals(row.efficiency_3d, null);
    assertStrictEquals(row.trend_7d_pct, 250);
    assertStrictEquals(row.status_tier, "exception");
    assertStrictEquals(row.status, "critical");
    assertStrictEquals(row.alert_eligible, true);
    assertMatch(row.status_reason, /CPL.*אין יעד/);

    const [candidate] = evaluatePulseInstantAlerts(
      [{ client_id: "a", client_name: "a", campaign_breakdown: [row] }],
      [],
      INSTANT_RULES,
    );
    assertMatch(candidate.message, /יעד: אין יעד\n/);
    assertMatch(candidate.message, /3 ימים: אין תוצאות/);
    assertMatch(candidate.message, /החמרה מול הבסיס: 3 ימים אין תוצאות/);
    assertStrictEquals(candidate.evidence?.no_results_3d, true);

    // Off by default: the same campaign is a yellow, silent exception.
    const off = onlyRow(records, tables, null);
    assertStrictEquals(off.status, "warning");
    assertStrictEquals(off.alert_eligible, false);
  },
);
