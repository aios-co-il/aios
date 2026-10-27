import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  DEFAULT_PULSE_ALERT_RULES,
  evaluatePulseInstantAlerts,
  parsePulseAlertRules,
} from "./pulse-instant-alerts.ts";

Deno.test("parsePulseAlertRules applies defaults", () => {
  assertEquals(parsePulseAlertRules(null), DEFAULT_PULSE_ALERT_RULES);
  assertStrictEquals(
    parsePulseAlertRules({ cpl_spike_pct: 60 }).cpl_spike_pct,
    60,
  );
});

Deno.test("evaluatePulseInstantAlerts detects no contact and CPL spike", () => {
  const now = Date.parse("2026-09-15T07:00:00+03:00");
  const rows = evaluatePulseInstantAlerts(
    [
      {
        client_id: "c1",
        client_name: "Acme",
        status: "warning",
        cpl_change_pct: 55,
        flags: [],
        last_client_call_at: null,
      },
    ],
    [],
    DEFAULT_PULSE_ALERT_RULES,
    now,
  );
  assertStrictEquals(rows.length, 2);
  assert(rows.some((row) => row.rule_type === "no_contact"));
  assert(rows.some((row) => row.rule_type === "cpl_spike"));
});

Deno.test("evaluatePulseInstantAlerts respects disabled master switch", () => {
  const rows = evaluatePulseInstantAlerts(
    [{ client_id: "c1", client_name: "Acme", cpl_change_pct: 99, flags: [] }],
    [],
    { ...DEFAULT_PULSE_ALERT_RULES, instant_wa_enabled: false },
  );
  assertEquals(rows, []);
});

Deno.test(
  "campaign exception includes target, evidence and last-change context",
  () => {
    const rows = evaluatePulseInstantAlerts(
      [
        {
          client_id: "c1",
          client_name: "Acme",
          flags: [],
          campaign_breakdown: [
            {
              campaign_key: "meta:id:123",
              campaign_name: "Leads",
              goal: "leads",
              status_reason: "חריגה מתמשכת מהיעד המאושר",
              alert_eligible: true,
              target_kind: "cpl",
              target_value: 30,
              efficiency_3d: 52,
              efficiency_7d: 48,
              trend_3d_pct: 40,
              trend_7d_pct: 31,
              data_fresh_through: "2026-09-17",
              last_change_at: "2026-09-10T08:00:00Z",
            },
          ],
        },
      ],
      [],
      DEFAULT_PULSE_ALERT_RULES,
    );
    const exception = rows.find(
      (row) => row.rule_type === "campaign_exception",
    );
    assert(exception);
    assertStrictEquals(exception.campaign_key, "meta:id:123");
    assertStrictEquals(exception.evidence.target_value, 30);
    assertMatch(exception.message, /קמפיין: Leads/);
    assertMatch(exception.message, /שינוי אחרון: 2026-09-10/);
  },
);

Deno.test(
  "target-aware campaign rows suppress the legacy raw CPL-spike alert",
  () => {
    const rows = evaluatePulseInstantAlerts(
      [
        {
          client_id: "c1",
          client_name: "Acme",
          cpl_change_pct: 80,
          flags: [],
          campaign_breakdown: [
            {
              campaign_key: "meta:id:123",
              campaign_name: "Leads",
              goal: "leads",
              status_reason: "התוצאה בתוך היעד המאושר",
              alert_eligible: false,
            },
          ],
        },
      ],
      [],
      DEFAULT_PULSE_ALERT_RULES,
    );
    assertStrictEquals(
      rows.some((row) => row.rule_type === "cpl_spike"),
      false,
    );
    assertStrictEquals(
      rows.some((row) => row.rule_type === "campaign_exception"),
      false,
    );
  },
);
