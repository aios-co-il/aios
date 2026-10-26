import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PULSE_ALERT_RULES,
  confirmPulseExceptionCandidate,
  decideInstantAlertDelivery,
  deliverInstantPulseAlerts,
  evaluatePulseInstantAlerts,
  instantPulseAlertsGate,
  isSameInstantAlertFinding,
  parsePulseAlertRules,
  runGatedInstantPulseAlerts,
} from "./pulse-instant-alerts.ts";

test("parsePulseAlertRules applies defaults", () => {
  assert.deepEqual(parsePulseAlertRules(null), DEFAULT_PULSE_ALERT_RULES);
  assert.equal(parsePulseAlertRules({ cpl_spike_pct: 60 }).cpl_spike_pct, 60);
});

test("evaluatePulseInstantAlerts detects no contact and CPL spike", () => {
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
  assert.equal(rows.length, 2);
  assert.ok(rows.some((row) => row.rule_type === "no_contact"));
  assert.ok(rows.some((row) => row.rule_type === "cpl_spike"));
});

test("evaluatePulseInstantAlerts respects disabled master switch", () => {
  const rows = evaluatePulseInstantAlerts(
    [{ client_id: "c1", client_name: "Acme", cpl_change_pct: 99, flags: [] }],
    [],
    { ...DEFAULT_PULSE_ALERT_RULES, instant_wa_enabled: false },
  );
  assert.deepEqual(rows, []);
});

test("campaign exception includes target, evidence and last-change context", () => {
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
  const exception = rows.find((row) => row.rule_type === "campaign_exception");
  assert.ok(exception);
  assert.equal(exception.campaign_key, "meta:id:123");
  assert.equal(exception.evidence.target_value, 30);
  assert.match(exception.message, /קמפיין: Leads/);
  assert.match(exception.message, /שינוי אחרון: 2026-09-10/);
});

test("target-aware campaign rows suppress the legacy raw CPL-spike alert", () => {
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
  assert.equal(
    rows.some((row) => row.rule_type === "cpl_spike"),
    false,
  );
  assert.equal(
    rows.some((row) => row.rule_type === "campaign_exception"),
    false,
  );
});

test("automatic AI verification may veto a filtered exception", () => {
  const candidate = {
    client_id: "c1",
    client_name: "Acme",
    rule_type: "campaign_exception",
    message: "evidence",
    evidence: { target_value: 30 },
  };
  assert.equal(
    confirmPulseExceptionCandidate(candidate, { confirmed: false }),
    null,
  );
  const confirmed = confirmPulseExceptionCandidate(candidate, {
    confirmed: true,
    summary: "החריגה מאומתת",
    recommended_check: "בדיקת אירוע ההמרה",
  });
  assert.match(confirmed.message, /אימות AI/);
  assert.equal(confirmed.evidence.ai_confirmation.confirmed, true);
});

// ── AIO-226: dedupe, gating and Shabbat ──────────────────────────────────────

/** Minimal Supabase stand-in: pulse_instant_alert_log in memory, no staff. */
function fakeSupabase(log = []) {
  const db = { pulse_instant_alert_log: log };
  const query = (table) => {
    const filters = [];
    let limit = Infinity;
    let descending = false;
    const builder = {
      select: () => builder,
      eq: (col, val) => (filters.push((row) => row[col] === val), builder),
      in: (col, vals) => (
        filters.push((row) => vals.includes(row[col])),
        builder
      ),
      gte: (col, val) => (filters.push((row) => row[col] >= val), builder),
      order: (_col, opts) => (
        (descending = opts?.ascending === false),
        builder
      ),
      limit: (n) => ((limit = n), builder),
      insert: async (row) => {
        (db[table] ||= []).push({ sent_at: fakeSupabase.clock, ...row });
        return { error: null };
      },
      then: (resolve) => {
        const rows = (db[table] || []).filter((row) =>
          filters.every((f) => f(row)),
        );
        rows.sort((a, b) =>
          descending
            ? String(b.sent_at).localeCompare(String(a.sent_at))
            : String(a.sent_at).localeCompare(String(b.sent_at)),
        );
        resolve({ data: rows.slice(0, limit), error: null });
      },
    };
    return builder;
  };
  return { from: query, log };
}

const ACME = {
  client_id: "c1",
  client_name: "Acme",
  status: "warning",
  flags: ["סנכרון ישן: Meta"],
  last_client_call_at: null,
};

async function run(supabase, now, snapshots = [ACME], extra = {}) {
  fakeSupabase.clock = now.toISOString();
  const sends = [];
  const result = await deliverInstantPulseAlerts({
    supabase,
    tenantId: "t1",
    tenantSlug: "test-tenant",
    pulsePhone: "0501234567",
    snapshots,
    criticalIssues: [],
    rules: DEFAULT_PULSE_ALERT_RULES,
    queueWhatsApp: async (message, phone) => (
      sends.push({ message, phone }),
      true
    ),
    now,
    ...extra,
  });
  return { result, sends };
}

const WEDNESDAY = new Date("2026-10-28T07:00:00Z"); // 09:00 Israel

test("client-level rules get deterministic fingerprints", () => {
  const rows = evaluatePulseInstantAlerts(
    [ACME],
    [],
    DEFAULT_PULSE_ALERT_RULES,
    WEDNESDAY.getTime(),
  );
  const byRule = Object.fromEntries(
    rows.map((row) => [row.rule_type, row.fingerprint]),
  );
  assert.equal(byRule.no_contact, "no_contact:c1:missing");
  assert.equal(byRule.connection_lost, "connection_lost:c1:open");
  const again = evaluatePulseInstantAlerts(
    [ACME],
    [],
    DEFAULT_PULSE_ALERT_RULES,
    WEDNESDAY.getTime() + 3600e3,
  );
  assert.deepEqual(
    again.map((row) => row.fingerprint),
    rows.map((row) => row.fingerprint),
  );
});

test("two identical runs send each finding once", async () => {
  const supabase = fakeSupabase();
  const first = await run(supabase, WEDNESDAY);
  assert.equal(first.result.sent, 2); // no_contact + connection_lost
  assert.equal(first.sends.length, 2);
  const second = await run(supabase, new Date(WEDNESDAY.getTime() + 3600e3));
  assert.equal(second.result.sent, 0);
  assert.equal(second.sends.length, 0);
  assert.equal(supabase.log.length, 2);
  assert.ok(supabase.log.every((row) => row.fingerprint));
});

test("a legacy NULL-fingerprint row inside the throttle window suppresses a resend", async () => {
  const hourAgo = new Date(WEDNESDAY.getTime() - 3600e3).toISOString();
  const supabase = fakeSupabase([
    {
      tenant_id: "t1",
      client_id: "c1",
      rule_type: "no_contact",
      fingerprint: null,
      sent_at: hourAgo,
    },
    {
      tenant_id: "t1",
      client_id: "c1",
      rule_type: "connection_lost",
      fingerprint: null,
      sent_at: hourAgo,
    },
  ]);
  const { result, sends } = await run(supabase, WEDNESDAY);
  assert.equal(result.sent, 0);
  assert.equal(sends.length, 0);
});

test("a legacy NULL row outside the throttle window no longer blocks the weekly reminder", async () => {
  const eightDaysAgo = new Date(
    WEDNESDAY.getTime() - 8 * 86400e3,
  ).toISOString();
  const supabase = fakeSupabase([
    {
      tenant_id: "t1",
      client_id: "c1",
      rule_type: "no_contact",
      fingerprint: null,
      sent_at: eightDaysAgo,
    },
  ]);
  const { result } = await run(supabase, WEDNESDAY, [{ ...ACME, flags: [] }]);
  assert.equal(result.sent, 1);
});

test("fingerprint comparison treats undefined and null alike", () => {
  assert.equal(isSameInstantAlertFinding(null, undefined), true);
  assert.equal(isSameInstantAlertFinding(undefined, "x"), true); // legacy row
  assert.equal(isSameInstantAlertFinding("x", "x"), true);
  assert.equal(isSameInstantAlertFinding("x", "y"), false);
  assert.equal(isSameInstantAlertFinding("x", undefined), false);
});

test("a finding that flaps back inside the window is not resent", () => {
  const rows = [{ fingerprint: "b" }, { fingerprint: "a" }];
  assert.deepEqual(
    decideInstantAlertDelivery(
      { rule_type: "connection_lost", fingerprint: "a" },
      rows,
    ),
    { send: false, reason: "duplicate" },
  );
});

test("campaign_exception still resends when 10% worse, other rules do not", () => {
  const rows = [{ fingerprint: "k", severity_score: 40 }];
  assert.equal(
    decideInstantAlertDelivery(
      {
        rule_type: "campaign_exception",
        fingerprint: "k",
        severity_score: 44.1,
      },
      rows,
    ).send,
    true,
  );
  assert.equal(
    decideInstantAlertDelivery(
      { rule_type: "campaign_exception", fingerprint: "k", severity_score: 44 },
      rows,
    ).send,
    false,
  );
  assert.equal(
    decideInstantAlertDelivery(
      { rule_type: "cpl_spike", fingerprint: "k", severity_score: 99 },
      rows,
    ).send,
    false,
  );
});

test("instant alerts gate: preview, manual trigger and skip flag send nothing", async () => {
  const enabled = {
    campaignPulseEnabled: true,
    rules: DEFAULT_PULSE_ALERT_RULES,
  };
  assert.deepEqual(instantPulseAlertsGate({ ...enabled, body: {} }), {
    run: true,
    reason: null,
  });
  assert.deepEqual(
    instantPulseAlertsGate({
      ...enabled,
      body: { deliver: false, source: "post_facebook_sync" },
    }),
    { run: true, reason: null },
  );
  const cases = [
    [{ ...enabled, body: { preview_only: true } }, "preview_only"],
    [
      {
        ...enabled,
        body: {
          deliver: true,
          force_delivery: true,
          source: "approved_manual_trigger",
        },
      },
      "manual_trigger",
    ],
    [
      { ...enabled, body: { skip_instant_alerts: true } },
      "skip_instant_alerts",
    ],
    [
      {
        campaignPulseEnabled: false,
        rules: DEFAULT_PULSE_ALERT_RULES,
        body: {},
      },
      "pulse_disabled",
    ],
    [
      {
        campaignPulseEnabled: true,
        rules: { ...DEFAULT_PULSE_ALERT_RULES, instant_wa_enabled: false },
        body: {},
      },
      "instant_wa_disabled",
    ],
    [
      { campaignPulseEnabled: true, rules: null, body: {} },
      "instant_wa_disabled",
    ],
  ];
  for (const [input, reason] of cases) {
    const gate = instantPulseAlertsGate(input);
    assert.deepEqual(gate, { run: false, reason });
    const sends = [];
    const result = await runGatedInstantPulseAlerts(gate, {
      supabase: fakeSupabase(),
      tenantId: "t1",
      pulsePhone: "0501234567",
      snapshots: [ACME],
      criticalIssues: [],
      rules: DEFAULT_PULSE_ALERT_RULES,
      queueWhatsApp: async (message) => (sends.push(message), true),
      now: WEDNESDAY,
    });
    assert.equal(sends.length, 0, reason);
    assert.equal(result.suppressed, reason);
  }
});

test("on Saturday only connection_lost goes out; the rest is sent once after Shabbat", async () => {
  const supabase = fakeSupabase();
  const saturday = new Date("2026-10-31T09:00:00Z"); // 11:00 Israel
  const sat = await run(supabase, saturday);
  assert.equal(sat.result.sent, 1);
  assert.equal(sat.result.held, 1);
  assert.match(sat.sends[0].message, /חיבור\/קמפיין/);
  assert.deepEqual(
    supabase.log.map((row) => row.rule_type),
    ["connection_lost"],
  );

  const lateSaturday = await run(supabase, new Date("2026-10-31T21:30:00Z")); // 23:30 Israel
  assert.equal(lateSaturday.result.sent, 0);

  const sunday = await run(supabase, new Date("2026-11-01T04:00:00Z")); // 06:00 Israel
  assert.equal(sunday.result.sent, 1);
  assert.equal(sunday.sends[0].message.includes("אין עדכון קשר"), true);
  // Still inside connection_lost's 24h throttle and no_contact's 7 days.
  const sundayLater = await run(supabase, new Date("2026-11-01T07:00:00Z"));
  assert.equal(sundayLater.result.sent, 0);
});
