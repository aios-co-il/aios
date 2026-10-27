import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_PULSE_ALERT_RULES,
  PULSE_WORDING_MAX_CHARS,
  applyPulseExceptionWording,
  buildExceptionSummaryMessage,
  decideInstantAlertDelivery,
  deliverInstantPulseAlerts,
  evaluatePulseInstantAlerts,
  instantPulseAlertsGate,
  isSameInstantAlertFinding,
  maxExceptionMessagesPerRun,
  parsePulseAlertRules,
  runGatedInstantPulseAlerts,
  sanitizePulseWordingLine,
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

// ── AIO-226: dedupe, gating and Shabbat ──────────────────────────────────────

/**
 * Minimal Supabase stand-in: pulse_instant_alert_log in memory, no staff
 * unless `tables` adds user_roles / user_managed_agencies / profiles rows.
 */
function fakeSupabase(log = [], tables = {}) {
  const db = { ...tables, pulse_instant_alert_log: log };
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

Deno.test("client-level rules get deterministic fingerprints", () => {
  const rows = evaluatePulseInstantAlerts(
    [ACME],
    [],
    DEFAULT_PULSE_ALERT_RULES,
    WEDNESDAY.getTime(),
  );
  const byRule = Object.fromEntries(
    rows.map((row) => [row.rule_type, row.fingerprint]),
  );
  assertStrictEquals(byRule.no_contact, "no_contact:c1:missing");
  assertStrictEquals(byRule.connection_lost, "connection_lost:c1:open");
  const again = evaluatePulseInstantAlerts(
    [ACME],
    [],
    DEFAULT_PULSE_ALERT_RULES,
    WEDNESDAY.getTime() + 3600e3,
  );
  assertEquals(
    again.map((row) => row.fingerprint),
    rows.map((row) => row.fingerprint),
  );
});

Deno.test("two identical runs send each finding once", async () => {
  const supabase = fakeSupabase();
  const first = await run(supabase, WEDNESDAY);
  assertStrictEquals(first.result.sent, 2); // no_contact + connection_lost
  assertStrictEquals(first.sends.length, 2);
  const second = await run(supabase, new Date(WEDNESDAY.getTime() + 3600e3));
  assertStrictEquals(second.result.sent, 0);
  assertStrictEquals(second.sends.length, 0);
  assertStrictEquals(supabase.log.length, 2);
  assert(supabase.log.every((row) => row.fingerprint));
});

Deno.test(
  "a legacy NULL-fingerprint row inside the throttle window suppresses a resend",
  async () => {
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
    assertStrictEquals(result.sent, 0);
    assertStrictEquals(sends.length, 0);
  },
);

Deno.test(
  "a legacy NULL row outside the throttle window no longer blocks the weekly reminder",
  async () => {
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
    assertStrictEquals(result.sent, 1);
  },
);

Deno.test("fingerprint comparison treats undefined and null alike", () => {
  assertStrictEquals(isSameInstantAlertFinding(null, undefined), true);
  assertStrictEquals(isSameInstantAlertFinding(undefined, "x"), true); // legacy row
  assertStrictEquals(isSameInstantAlertFinding("x", "x"), true);
  assertStrictEquals(isSameInstantAlertFinding("x", "y"), false);
  assertStrictEquals(isSameInstantAlertFinding("x", undefined), false);
});

Deno.test("a finding that flaps back inside the window is not resent", () => {
  const rows = [{ fingerprint: "b" }, { fingerprint: "a" }];
  assertEquals(
    decideInstantAlertDelivery(
      { rule_type: "connection_lost", fingerprint: "a" },
      rows,
    ),
    { send: false, reason: "duplicate" },
  );
});

Deno.test(
  "campaign_exception still resends when 10% worse, other rules do not",
  () => {
    const rows = [{ fingerprint: "k", severity_score: 40 }];
    assertStrictEquals(
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
    assertStrictEquals(
      decideInstantAlertDelivery(
        {
          rule_type: "campaign_exception",
          fingerprint: "k",
          severity_score: 44,
        },
        rows,
      ).send,
      false,
    );
    assertStrictEquals(
      decideInstantAlertDelivery(
        { rule_type: "cpl_spike", fingerprint: "k", severity_score: 99 },
        rows,
      ).send,
      false,
    );
  },
);

Deno.test(
  "instant alerts gate: preview, manual trigger and skip flag send nothing",
  async () => {
    const enabled = {
      campaignPulseEnabled: true,
      rules: DEFAULT_PULSE_ALERT_RULES,
    };
    assertEquals(instantPulseAlertsGate({ ...enabled, body: {} }), {
      run: true,
      reason: null,
    });
    assertEquals(
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
      assertEquals(gate, { run: false, reason });
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
      assertStrictEquals(sends.length, 0, reason);
      assertStrictEquals(result.suppressed, reason);
    }
  },
);

Deno.test(
  "on Saturday only connection_lost goes out; the rest is sent once after Shabbat",
  async () => {
    const supabase = fakeSupabase();
    const saturday = new Date("2026-10-31T09:00:00Z"); // 11:00 Israel
    const sat = await run(supabase, saturday);
    assertStrictEquals(sat.result.sent, 1);
    assertStrictEquals(sat.result.held, 1);
    assertMatch(sat.sends[0].message, /חיבור\/קמפיין/);
    assertEquals(
      supabase.log.map((row) => row.rule_type),
      ["connection_lost"],
    );

    const lateSaturday = await run(supabase, new Date("2026-10-31T21:30:00Z")); // 23:30 Israel
    assertStrictEquals(lateSaturday.result.sent, 0);

    const sunday = await run(supabase, new Date("2026-11-01T04:00:00Z")); // 06:00 Israel
    assertStrictEquals(sunday.result.sent, 1);
    assertStrictEquals(sunday.sends[0].message.includes("אין עדכון קשר"), true);
    // Still inside connection_lost's 24h throttle and no_contact's 7 days.
    const sundayLater = await run(supabase, new Date("2026-11-01T07:00:00Z"));
    assertStrictEquals(sundayLater.result.sent, 0);
  },
);

const SATURDAY_11 = new Date("2026-10-31T09:00:00Z"); // 11:00 Israel
const SUNDAY_06 = new Date("2026-11-01T04:00:00Z"); // 06:00 Israel
const NO_CONTACT_OFF = {
  ...DEFAULT_PULSE_ALERT_RULES,
  no_contact_enabled: false,
};
const healthy = (flags = []) => ({
  client_id: "c1",
  client_name: "Acme",
  status: "warning",
  flags,
  last_client_call_at: WEDNESDAY.toISOString(),
});

Deno.test(
  "on Saturday a connection_lost made only of single-campaign issues is held, then sent once after Shabbat",
  async () => {
    const cases = [
      {
        label: "ad_disapproved",
        flags: [],
        issues: [{ clientId: "c1", alertType: "ad_disapproved" }],
      },
      {
        label: "campaign_stopped",
        flags: [],
        issues: [{ clientId: "c1", alertType: "campaign_stopped" }],
      },
      { label: "קמפיין נעצר flag", flags: ["קמפיין נעצר"], issues: [] },
      {
        label: "N קמפיינים נעצרו flag",
        flags: ["2 קמפיינים נעצרו"],
        issues: [],
      },
    ];
    for (const { label, flags, issues } of cases) {
      const supabase = fakeSupabase();
      const extra = { criticalIssues: issues, rules: NO_CONTACT_OFF };
      const sat = await run(supabase, SATURDAY_11, [healthy(flags)], extra);
      assertStrictEquals(sat.result.sent, 0, label);
      assertStrictEquals(sat.result.held, 1, label);
      assertStrictEquals(sat.sends.length, 0, label);
      assertStrictEquals(supabase.log.length, 0, label);

      const sunday = await run(supabase, SUNDAY_06, [healthy(flags)], extra);
      assertStrictEquals(sunday.result.sent, 1, label);
      const again = await run(
        supabase,
        new Date(SUNDAY_06.getTime() + 3600e3),
        [healthy(flags)],
        extra,
      );
      assertStrictEquals(again.result.sent, 0, label);
    }
  },
);

Deno.test("on Saturday a real connection loss still goes out", async () => {
  const cases = [
    {
      label: "stale sync",
      snapshot: healthy(["סנכרון ישן או חסר: Meta"]),
      issues: [],
    },
    {
      label: "missing table",
      snapshot: healthy(["אין טבלת קמפיין מחוברת"]),
      issues: [],
    },
    {
      label: "no_data without a table",
      snapshot: { ...healthy(["אין טבלת קמפיין מחוברת"]), status: "no_data" },
      issues: [],
    },
    {
      label: "account disabled",
      snapshot: healthy([]),
      issues: [{ clientId: "c1", alertType: "account_disabled" }],
    },
    {
      label: "stale sync together with a disapproved ad",
      snapshot: healthy(["סנכרון ישן או חסר: Meta"]),
      issues: [{ clientId: "c1", alertType: "ad_disapproved" }],
    },
  ];
  for (const { label, snapshot, issues } of cases) {
    const supabase = fakeSupabase();
    const sat = await run(supabase, SATURDAY_11, [snapshot], {
      criticalIssues: issues,
      rules: NO_CONTACT_OFF,
    });
    assertStrictEquals(sat.result.sent, 1, label);
    assertStrictEquals(sat.result.held, 0, label);
    assertMatch(sat.sends[0].message, /חיבור\/קמפיין/, label);
  }
});

Deno.test(
  "connection_lost marks only real connection loss as Shabbat-critical",
  () => {
    const evaluate = (flags, issues = []) =>
      evaluatePulseInstantAlerts([healthy(flags)], issues, NO_CONTACT_OFF)[0]
        ?.shabbat_critical;
    assertStrictEquals(evaluate(["סנכרון ישן: Meta"]), true);
    assertStrictEquals(evaluate(["אין טבלת קמפיין מחוברת"]), true);
    assertStrictEquals(
      evaluate([], [{ clientId: "c1", alertType: "account_disabled" }]),
      true,
    );
    assertStrictEquals(evaluate(["קמפיין נעצר"]), false);
    assertStrictEquals(
      evaluate([], [{ clientId: "c1", alertType: "ad_disapproved" }]),
      false,
    );
    assertStrictEquals(
      evaluate([], [{ clientId: "c1", alertType: "campaign_stopped" }]),
      false,
    );
  },
);

// ── AIO-243: the model only words a campaign_exception, never vetoes it ─────

const EXCEPTION_CAMPAIGN = {
  campaign_key: "meta:id:123",
  campaign_name: "Leads",
  goal: "leads",
  status_reason: "חריגה מתמשכת מהיעד המאושר (CPL 30)",
  alert_eligible: true,
  target_kind: "cpl",
  target_value: 30,
  efficiency_3d: 52,
  efficiency_7d: 48,
  trend_3d_pct: 40,
  trend_7d_pct: 31,
  data_fresh_through: "2026-10-27",
  last_change_at: "2026-10-20T08:00:00Z",
};
const exceptionSnapshot = (...campaigns) => ({
  ...healthy([]),
  campaign_breakdown: campaigns.length ? campaigns : [EXCEPTION_CAMPAIGN],
});
const deterministicExceptionMessage = (snapshot = exceptionSnapshot()) => {
  const rows = evaluatePulseInstantAlerts(
    [snapshot],
    [],
    NO_CONTACT_OFF,
    WEDNESDAY.getTime(),
  );
  assertEquals(
    rows.map((row) => row.rule_type),
    ["campaign_exception"],
  );
  return rows[0].message;
};
const STATIC_CHECK =
  "בדיקה מומלצת: לאמת יעד, אירוע אופטימיזציה ושינויים אחרונים לפני פעולה.";

Deno.test(
  "a campaign_exception is queued whatever the model answers, with the deterministic text",
  async () => {
    // Like fetch: settles only when aborted, and then rejects (after the
    // timeout already won, so the rejection must not go unhandled).
    const rejectsOnAbort = (signal) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    let abortedSignal = null;
    const cases = [
      {
        label: "model says confirmed:false",
        extra: { phraseException: async () => ({ confirmed: false }) },
        ai_wording: { applied: false, error: "no_wording" },
        calls: 1,
      },
      {
        label: "model returns null",
        extra: { phraseException: async () => null },
        ai_wording: { applied: false, error: "no_wording" },
        calls: 1,
      },
      {
        label: "model call throws",
        extra: {
          phraseException: async () => {
            throw new Error("upstream 500");
          },
        },
        ai_wording: { applied: false, error: "call_failed" },
        calls: 1,
      },
      {
        label: "model call throws synchronously",
        extra: {
          phraseException: () => {
            throw new Error("bad client");
          },
        },
        ai_wording: { applied: false, error: "call_failed" },
        calls: 1,
      },
      {
        label: "model call times out",
        extra: {
          phraseException: (_candidate, { signal }) => {
            abortedSignal = signal;
            return rejectsOnAbort(signal);
          },
          wordingTimeoutMs: 10,
        },
        ai_wording: { applied: false, error: "timeout" },
        calls: 1,
      },
      {
        label: "no model wired",
        extra: {},
        ai_wording: { applied: false, error: "not_configured" },
        calls: 0,
      },
    ];
    const expected = deterministicExceptionMessage();
    for (const { label, extra, ai_wording, calls } of cases) {
      const supabase = fakeSupabase();
      const { result, sends } = await run(
        supabase,
        WEDNESDAY,
        [exceptionSnapshot()],
        { rules: NO_CONTACT_OFF, ...extra },
      );
      assertStrictEquals(result.sent, 1, label);
      assertStrictEquals(result.skipped, 0, label);
      assertStrictEquals(result.wording_calls, calls, label);
      assertStrictEquals(result.worded, 0, label);
      assertStrictEquals(sends.length, 1, label);
      assertStrictEquals(sends[0].message, expected, label);
      assertStrictEquals(supabase.log.length, 1, label);
      assertStrictEquals(supabase.log[0].message, expected, label);
      assertEquals(supabase.log[0].evidence.ai_wording, ai_wording, label);
      assertStrictEquals(
        "ai_confirmation" in supabase.log[0].evidence,
        false,
        label,
      );
    }
    assert(abortedSignal?.aborted, "the timed-out call is aborted");
  },
);

Deno.test(
  "model wording is added while every deterministic line stays as built",
  async () => {
    const supabase = fakeSupabase();
    const { result, sends } = await run(
      supabase,
      WEDNESDAY,
      [exceptionSnapshot()],
      {
        rules: NO_CONTACT_OFF,
        phraseException: async () => ({
          summary:
            "**העלות לליד** גבוהה מהיעד המאושר\nכבר כמה ימים, בלי שינוי בקמפיין",
          recommended_check: "בדיקה מומלצת: לבדוק את אירוע ההמרה בפיקסל",
        }),
      },
    );
    assertStrictEquals(result.sent, 1);
    assertStrictEquals(result.wording_calls, 1);
    assertStrictEquals(result.worded, 1);
    const base = deterministicExceptionMessage().split("\n");
    const lines = sends[0].message.split("\n");
    const checkAt = base.indexOf(STATIC_CHECK);
    assert(checkAt > 0);
    assertEquals(lines, [
      ...base.slice(0, checkAt),
      "סיכום כרמן: העלות לליד גבוהה מהיעד המאושר כבר כמה ימים, בלי שינוי בקמפיין",
      "בדיקה מומלצת: לבדוק את אירוע ההמרה בפיקסל",
      ...base.slice(checkAt + 1),
    ]);
    assertStrictEquals(
      lines.filter((line) => line.startsWith("בדיקה מומלצת:")).length,
      1,
    );
    assertNotMatch(sends[0].message, /אימות AI/);
    assertEquals(supabase.log[0].evidence.ai_wording, { applied: true });
    assertStrictEquals(supabase.log[0].evidence.target_value, 30);
  },
);

Deno.test("model wording with invented numbers is dropped", async () => {
  const supabase = fakeSupabase();
  const { result, sends } = await run(
    supabase,
    WEDNESDAY,
    [exceptionSnapshot()],
    {
      rules: NO_CONTACT_OFF,
      phraseException: async () => ({
        summary: "העלות לליד הגיעה ל־75 ₪, פי 2 מהיעד",
        // 20 appears only inside the last-change date, which counts whole.
        recommended_check: "להוריד את התקציב ב־20%",
      }),
    },
  );
  assertStrictEquals(result.sent, 1);
  assertStrictEquals(result.worded, 0);
  assertStrictEquals(sends[0].message, deterministicExceptionMessage());
  assertEquals(supabase.log[0].evidence.ai_wording, {
    applied: false,
    error: "invented_number",
  });
});

Deno.test(
  "wording keeps numbers the evidence already shows and drops only a bad line",
  () => {
    const candidate = {
      client_id: "c1",
      client_name: "Acme",
      rule_type: "campaign_exception",
      message: deterministicExceptionMessage(),
      evidence: { target_value: 30, efficiency_3d: 52, efficiency_7d: 48 },
    };
    const worded = applyPulseExceptionWording(candidate, {
      summary: "ב־3 הימים האחרונים CPL 52 מעל יעד 30",
      recommended_check: "להעלות את התקציב פי 3.5",
    });
    assertEquals(worded.ai_wording, {
      applied: true,
      error: "invented_number",
    });
    assertMatch(
      worded.message,
      /\nסיכום כרמן: ב־3 הימים האחרונים CPL 52 מעל יעד 30\n/,
    );
    assert(worded.message.includes(STATIC_CHECK));
  },
);

Deno.test("wording lines are single, plain and capped", () => {
  const allowed = new Set(["3"]);
  assertEquals(
    sanitizePulseWordingLine("  *חשוב*\n_לבדוק_ ~פיקסל~ `קוד`  ", allowed),
    { ok: true, text: "חשוב לבדוק פיקסל קוד" },
  );
  assertEquals(
    sanitizePulseWordingLine("\u200fהקמפיין\u202b מעל\tהיעד\u2069", allowed),
    { ok: true, text: "הקמפיין מעל היעד" },
  );
  assertEquals(
    sanitizePulseWordingLine("סיכום כרמן: הקמפיין מעל היעד", allowed),
    { ok: true, text: "הקמפיין מעל היעד" },
  );
  const long = sanitizePulseWordingLine("מילה ".repeat(100), allowed);
  assert(long.ok);
  assert(long.text.length <= PULSE_WORDING_MAX_CHARS);
  assert(long.text.endsWith("…"));
  assertEquals(sanitizePulseWordingLine("ב־٣ ימים", allowed), {
    ok: false,
    reason: "invented_number",
  });
  assertEquals(sanitizePulseWordingLine("ראו https://x.example", allowed), {
    ok: false,
    reason: "invalid_text",
  });
  assertEquals(sanitizePulseWordingLine({ text: "x" }, allowed), {
    ok: false,
    reason: "invalid_text",
  });
  assertEquals(sanitizePulseWordingLine("   ", allowed), {
    ok: false,
    reason: "missing",
  });
});

Deno.test(
  "window labels and names do not license a number the evidence lacks",
  () => {
    // No target and spend without results: 3 and 7 appear only as window
    // lengths ("3 ימים:", "ב־7 הימים") and 2 only in the campaign name.
    const [candidate] = evaluatePulseInstantAlerts(
      [
        exceptionSnapshot({
          campaign_key: "meta:id:789",
          campaign_name: "Leads 2",
          goal: "leads",
          status_reason: "קיימת הוצאה ללא תוצאות ב־7 הימים המלאים האחרונים",
          alert_eligible: true,
          target_kind: null,
          target_value: null,
          efficiency_3d: null,
          efficiency_7d: null,
          trend_3d_pct: null,
          trend_7d_pct: null,
          data_fresh_through: "2026-10-27",
          last_change_at: null,
        }),
      ],
      [],
      NO_CONTACT_OFF,
      WEDNESDAY.getTime(),
    );
    assertMatch(candidate.message, /3 ימים: חסר · 7 ימים: חסר/);
    for (const summary of [
      "העלות גבוהה פי 3 מהיעד",
      "ירידה של 3%",
      "ירידה של 7% בלידים",
      "העלות גבוהה פי 2",
    ]) {
      const worded = applyPulseExceptionWording(candidate, { summary });
      assertStrictEquals(worded.message, candidate.message, summary);
      assertEquals(
        worded.ai_wording,
        { applied: false, error: "invented_number" },
        summary,
      );
    }
    // The same digits as window lengths are fine.
    const windowed = applyPulseExceptionWording(candidate, {
      summary: "ב־7 הימים האחרונים הייתה הוצאה בלי אף ליד",
    });
    assertEquals(windowed.ai_wording, { applied: true });
    assertMatch(
      windowed.message,
      /\nסיכום כרמן: ב־7 הימים האחרונים הייתה הוצאה בלי אף ליד\n/,
    );
  },
);

Deno.test("wording checks run on the shortened text that is shown", () => {
  const allowed = new Set(["1234"]);
  // No space between 120 and 239, so the cut falls inside "1234".
  const split = sanitizePulseWordingLine(
    `הקמפיין ${"א".repeat(PULSE_WORDING_MAX_CHARS - 12)}1234 ומעבר`,
    allowed,
  );
  assertEquals(split, { ok: false, reason: "invented_number" });
  // A link that only survives in the dropped tail is not shown, so the
  // shown part passes; one that reaches the shown part is rejected.
  const tail = sanitizePulseWordingLine(
    `${"מילה ".repeat(60)}https://x.example`,
    allowed,
  );
  assert(tail.ok);
  assertNotMatch(tail.text, /https|example/);
  assertEquals(
    sanitizePulseWordingLine(
      `${"מילה ".repeat(10)}1234 ראו https://x.example`,
      allowed,
    ),
    { ok: false, reason: "invalid_text" },
  );
});

Deno.test("wording rejects other numerals and bare domains", () => {
  const allowed = new Set(["30", "52.5"]);
  for (const text of ["עלייה של ²⁵", "שלב ① בבדיקה", "פרק Ⅻ", "חצי ½ מהיעד"]) {
    assertEquals(
      sanitizePulseWordingLine(text, allowed),
      { ok: false, reason: "invented_number" },
      text,
    );
  }
  for (const text of [
    "להיכנס ל־aios-login.co.il ולאשר",
    "לשלוח ל־wa.me/972500000000",
    "לבדוק ב-Example.COM",
  ]) {
    assertEquals(
      sanitizePulseWordingLine(text, allowed),
      { ok: false, reason: "invalid_text" },
      text,
    );
  }
  assertEquals(sanitizePulseWordingLine("CPL 52.5 מעל יעד 30.", allowed), {
    ok: true,
    text: "CPL 52.5 מעל יעד 30.",
  });
});

Deno.test("a minus sign is never dropped; only a bullet dash is", () => {
  const allowed = new Set(["30", "52"]);
  // A signed number is rejected whole, never shown without its sign.
  for (const text of [
    "-52 לליד",
    "סיכום כרמן: -52 לליד",
    "- -52 לליד",
    "−52 לליד",
    "-30% בהמרות",
  ]) {
    assertEquals(
      sanitizePulseWordingLine(text, allowed),
      { ok: false, reason: "invented_number" },
      text,
    );
  }
  assertEquals(sanitizePulseWordingLine("- 52 לליד", allowed), {
    ok: true,
    text: "52 לליד",
  });
  assertEquals(
    sanitizePulseWordingLine("• בדיקה מומלצת: - לבדוק את הפיקסל", allowed),
    { ok: true, text: "לבדוק את הפיקסל" },
  );
  // "ב-52" is a Hebrew prefix, not a minus sign.
  assertEquals(sanitizePulseWordingLine("העלות לליד עלתה ב-52", allowed), {
    ok: true,
    text: "העלות לליד עלתה ב-52",
  });
});

Deno.test("a repeated label right after a bare dash is dropped", () => {
  const allowed = new Set(["30"]);
  for (const [text, expected] of [
    ["-בדיקה מומלצת: לבדוק את הפיקסל", "לבדוק את הפיקסל"],
    ["—סיכום כרמן: הקמפיין מעל היעד", "הקמפיין מעל היעד"],
    ["–סיכום: הקמפיין מעל יעד 30", "הקמפיין מעל יעד 30"],
    ["בדיקה מומלצת: -לבדוק את הפיקסל", "לבדוק את הפיקסל"],
  ]) {
    assertEquals(
      sanitizePulseWordingLine(text, allowed),
      { ok: true, text: expected },
      text,
    );
  }
  const worded = applyPulseExceptionWording(
    {
      client_id: "c1",
      client_name: "Acme",
      rule_type: "campaign_exception",
      message: deterministicExceptionMessage(),
      evidence: { target_value: 30 },
    },
    { recommended_check: "-בדיקה מומלצת: לבדוק את אירוע ההמרה" },
  );
  assertEquals(worded.ai_wording, { applied: true });
  assertMatch(worded.message, /\nבדיקה מומלצת: לבדוק את אירוע ההמרה\n/);
  assertNotMatch(worded.message, /-בדיקה/);
});

Deno.test(
  "a percentage never passes, whatever its sign, direction or value",
  () => {
    // Trends are signed "worse than baseline" and flipped for ROAS, so code
    // cannot check a direction; no percentage in model text is accepted.
    const candidateWith = (trend) => ({
      client_id: "c1",
      client_name: "Acme",
      rule_type: "campaign_exception",
      message: deterministicExceptionMessage(),
      evidence: {
        goal: "leads",
        target_kind: "cpl",
        target_value: 30,
        efficiency_3d: 52,
        efficiency_7d: 48,
        trend_3d_pct: trend,
        trend_7d_pct: null,
      },
    });
    const cases = [
      [-12.5, "עלייה של 12.5% בעלות לליד"],
      [12.5, "ירידה של 12.5% בעלות לליד"],
      [-12.5, "שינוי של 12.5% בעלות לליד"],
      [12.5, "העלות לליד השתנתה ב-12.5%"],
      [-12.5, "-12.5% בעלות לליד"],
      [12.5, "+12.5% בעלות לליד"],
      [12.5, "עלייה של 12.5 אחוז"],
      [12.5, "עלייה של %12.5"],
      // 30 is the target CPL, not a change.
      [40, "ירידה של 30% בלידים"],
    ];
    for (const [trend, summary] of cases) {
      const candidate = candidateWith(trend);
      const worded = applyPulseExceptionWording(candidate, { summary });
      assertStrictEquals(worded.message, candidate.message, summary);
      assertEquals(
        worded.ai_wording,
        { applied: false, error: "invented_number" },
        summary,
      );
    }
    // A trend magnitude licenses no bare number either (wrong role).
    const roleSwap = applyPulseExceptionWording(candidateWith(40), {
      summary: "העלות לליד הגיעה ל־40",
    });
    assertEquals(roleSwap.ai_wording, {
      applied: false,
      error: "invented_number",
    });
    // Values the message shows still pass.
    const plain = applyPulseExceptionWording(candidateWith(40), {
      summary: "CPL 52 מעל יעד 30",
    });
    assertEquals(plain.ai_wording, { applied: true });
  },
);

Deno.test(
  "a failed wording call does not stop the next alert of the same run",
  async () => {
    const second = {
      ...EXCEPTION_CAMPAIGN,
      campaign_key: "meta:id:456",
      campaign_name: "Retargeting",
    };
    const supabase = fakeSupabase();
    let calls = 0;
    const { result, sends } = await run(
      supabase,
      WEDNESDAY,
      [exceptionSnapshot(EXCEPTION_CAMPAIGN, second)],
      {
        rules: NO_CONTACT_OFF,
        phraseException: async () => {
          calls += 1;
          if (calls === 1) throw new Error("model down");
          return { summary: "הקמפיין מעל היעד המאושר" };
        },
      },
    );
    assertStrictEquals(result.sent, 2);
    assertStrictEquals(result.wording_calls, 2);
    assertStrictEquals(result.worded, 1);
    assertStrictEquals(sends.length, 2);
    assertMatch(sends[0].message, /קמפיין: Leads/);
    assertNotMatch(sends[0].message, /סיכום כרמן/);
    assertMatch(sends[1].message, /קמפיין: Retargeting/);
    assertMatch(sends[1].message, /סיכום כרמן: הקמפיין מעל היעד המאושר/);
    assertEquals(
      supabase.log.map((row) => row.evidence.ai_wording),
      [{ applied: false, error: "call_failed" }, { applied: true }],
    );
  },
);

Deno.test(
  "dedupe still suppresses a repeated campaign_exception without a model call",
  async () => {
    const supabase = fakeSupabase();
    let calls = 0;
    const extra = {
      rules: NO_CONTACT_OFF,
      phraseException: async () => {
        calls += 1;
        return { confirmed: false };
      },
    };
    const first = await run(supabase, WEDNESDAY, [exceptionSnapshot()], extra);
    assertStrictEquals(first.result.sent, 1);
    const again = await run(
      supabase,
      new Date(WEDNESDAY.getTime() + 3600e3),
      [exceptionSnapshot()],
      extra,
    );
    assertStrictEquals(again.result.sent, 0);
    assertStrictEquals(again.result.skipped, 1);
    assertStrictEquals(again.sends.length, 0);
    assertStrictEquals(calls, 1);
    assertStrictEquals(supabase.log.length, 1);
  },
);

Deno.test(
  "campaign-pulse-snapshot sends instant alerts only through the gate",
  async () => {
    const snapshot = await readFile(
      new URL("../campaign-pulse-snapshot/index.ts", import.meta.url),
      "utf8",
    );
    assertNotMatch(snapshot, /deliverInstantPulseAlerts\(/);
    assertMatch(
      snapshot,
      /instantPulseAlertsGate\(\{\s*campaignPulseEnabled: setting\.campaign_pulse_enabled,\s*rules: setting\.pulse_alert_rules,\s*body,\s*\}\)/,
    );
    assertMatch(snapshot, /runGatedInstantPulseAlerts\(instantGate,/);
    // AIO-243: the model only words the alert; it has no confirm/veto field.
    assertMatch(snapshot, /phraseException: async \(candidate, \{ signal \}\)/);
    assertNotMatch(snapshot, /analyzeException|"confirmed"|ai_confirmation/);
    const manual = await readFile(
      new URL("../campaign-pulse-manual-trigger/index.ts", import.meta.url),
      "utf8",
    );
    assertMatch(manual, /skip_instant_alerts: true/);
    assertMatch(manual, /source: "approved_manual_trigger"/);
  },
);

// ── AIO-243: per-run flood guard for campaign_exception messages ────────────

const SUMMARY_HEADER = "🔴 *התראת דופק — סיכום חריגות קמפיין*";
/** n eligible exceptions; campaign i has trend 10*i, so the last is worst. */
const exceptionCampaigns = (n, prefix = "c") =>
  Array.from({ length: n }, (_, i) => ({
    ...EXCEPTION_CAMPAIGN,
    campaign_key: `meta:id:${prefix}${i + 1}`,
    campaign_name: `Campaign ${prefix}${i + 1}`,
    status_reason: `סיבה ${prefix}${i + 1}`,
    trend_3d_pct: 10 * (i + 1),
    trend_7d_pct: 0,
  }));
const isSummary = (message) => message.startsWith(SUMMARY_HEADER);

Deno.test(
  "7 eligible exceptions → 3 messages and one summary; all 7 logged; the next run sends nothing",
  async () => {
    const supabase = fakeSupabase();
    let wordingCalls = 0;
    const extra = {
      rules: NO_CONTACT_OFF,
      phraseException: async () => {
        wordingCalls += 1;
        return null;
      },
    };
    const snapshot = exceptionSnapshot(...exceptionCampaigns(7));
    const first = await run(supabase, WEDNESDAY, [snapshot], extra);
    assertStrictEquals(first.sends.length, 4);
    assert(first.sends.every((send) => send.phone === "972501234567"));
    const individual = first.sends.filter((send) => !isSummary(send.message));
    const summaries = first.sends.filter((send) => isSummary(send.message));
    assertStrictEquals(individual.length, 3);
    assertStrictEquals(summaries.length, 1);
    // The three most severe go out on their own, in evaluation order.
    assertEquals(
      individual.map((send) => send.message.match(/קמפיין: (.*)/)[1]),
      ["Campaign c5", "Campaign c6", "Campaign c7"],
    );
    assertStrictEquals(
      summaries[0].message,
      [
        SUMMARY_HEADER,
        "עוד 4 חריגות קמפיין:",
        "• Acme · Campaign c4 · סיבה c4",
        "• Acme · Campaign c3 · סיבה c3",
        "• Acme · Campaign c2 · סיבה c2",
        "• Acme · Campaign c1 · סיבה c1",
        "",
        "AIOS → דשבורד דופק",
      ].join("\n"),
    );
    assertEquals(
      {
        sent: first.result.sent,
        summarized: first.result.summarized,
        summary_messages: first.result.summary_messages,
        skipped: first.result.skipped,
        wording_calls: first.result.wording_calls,
      },
      {
        sent: 3,
        summarized: 4,
        summary_messages: 1,
        skipped: 0,
        wording_calls: 3,
      },
    );
    // No model call for alerts that went out only in the summary.
    assertStrictEquals(wordingCalls, 3);

    assertStrictEquals(supabase.log.length, 7);
    const byKey = Object.fromEntries(
      supabase.log.map((row) => [row.campaign_key, row]),
    );
    for (let i = 1; i <= 7; i++) {
      const row = byKey[`meta:id:c${i}`];
      assert(row, `c${i} logged`);
      assertStrictEquals(row.rule_type, "campaign_exception");
      assertStrictEquals(row.fingerprint, `meta:id:c${i}:סיבה c${i}:cpl:30`);
      assertStrictEquals(row.severity_score, 10 * i);
      assertStrictEquals(row.recipient_phone, "972501234567");
      assertStrictEquals(row.evidence.delivery, i <= 4 ? "summary" : undefined);
    }

    const second = await run(
      supabase,
      new Date(WEDNESDAY.getTime() + 3600e3),
      [snapshot],
      extra,
    );
    assertStrictEquals(second.sends.length, 0);
    assertStrictEquals(second.result.sent, 0);
    assertStrictEquals(second.result.summarized, 0);
    assertStrictEquals(second.result.skipped, 7);
    assertStrictEquals(supabase.log.length, 7);
    assertStrictEquals(wordingCalls, 3);
  },
);

Deno.test("the cap counts per recipient phone", async () => {
  // The owner sees both clients; the manager only client c1 (agency a1).
  const supabase = fakeSupabase([], {
    user_roles: [{ tenant_id: "t1", user_id: "m1", role: "team_manager" }],
    user_managed_agencies: [{ user_id: "m1", agency_id: "a1" }],
    profiles: [
      { id: "m1", full_name: "Manager", campaigners: { phone: "0529999999" } },
    ],
  });
  const c1 = {
    ...exceptionSnapshot(...exceptionCampaigns(5, "a")),
    agency_id: "a1",
  };
  const c2 = {
    ...exceptionSnapshot(
      ...exceptionCampaigns(2, "b").map((campaign, i) => ({
        ...campaign,
        trend_3d_pct: 100 + i, // the two worst of the run
      })),
    ),
    client_id: "c2",
    client_name: "Beta",
    agency_id: "a2",
  };
  const { result, sends } = await run(supabase, WEDNESDAY, [c1, c2], {
    rules: NO_CONTACT_OFF,
  });
  const to = (phone) => sends.filter((send) => send.phone === phone);
  const owner = to("972501234567");
  const manager = to("972529999999");
  assertStrictEquals(owner.length, 4);
  assertStrictEquals(manager.length, 4);
  const names = (list) =>
    list
      .filter((send) => !isSummary(send.message))
      .map((send) => send.message.match(/קמפיין: (.*)/)[1])
      .sort();
  assertEquals(names(owner), ["Campaign a5", "Campaign b1", "Campaign b2"]);
  assertEquals(names(manager), ["Campaign a3", "Campaign a4", "Campaign a5"]);
  const summaryOf = (list) => list.find((send) => isSummary(send.message));
  assertMatch(summaryOf(owner).message, /\nעוד 4 חריגות קמפיין:\n/);
  assertMatch(summaryOf(manager).message, /\nעוד 2 חריגות קמפיין:\n/);
  assertNotMatch(summaryOf(manager).message, /Beta/);
  // a3 and a4 went out on their own to the manager; only a1 and a2 went out
  // only inside summaries.
  assertEquals(
    {
      sent: result.sent,
      summarized: result.summarized,
      summary_messages: result.summary_messages,
      skipped: result.skipped,
    },
    { sent: 5, summarized: 2, summary_messages: 2, skipped: 0 },
  );
  assertStrictEquals(supabase.log.length, 7);
});

Deno.test(
  "max_exception_messages_per_run overrides the cap, clamped to 1..10",
  async () => {
    assertStrictEquals(maxExceptionMessagesPerRun(null), 3);
    assertStrictEquals(
      maxExceptionMessagesPerRun(DEFAULT_PULSE_ALERT_RULES),
      3,
    );
    const cap = (value) =>
      maxExceptionMessagesPerRun({
        ...DEFAULT_PULSE_ALERT_RULES,
        instant: { max_exception_messages_per_run: value },
      });
    assertStrictEquals(cap(5), 5);
    assertStrictEquals(cap("6"), 6);
    assertStrictEquals(cap(0), 1);
    assertStrictEquals(cap(-4), 1);
    assertStrictEquals(cap(50), 10);
    assertStrictEquals(cap(2.9), 2);
    assertStrictEquals(cap("many"), 3);
    assertStrictEquals(cap(null), 3);
    assertStrictEquals(cap(true), 3);

    const snapshot = exceptionSnapshot(...exceptionCampaigns(7));
    const five = await run(fakeSupabase(), WEDNESDAY, [snapshot], {
      rules: {
        ...NO_CONTACT_OFF,
        instant: { max_exception_messages_per_run: 5 },
      },
    });
    assertStrictEquals(five.sends.length, 6);
    assertStrictEquals(five.result.sent, 5);
    assertStrictEquals(five.result.summarized, 2);
    assertMatch(
      five.sends.find((send) => isSummary(send.message)).message,
      /\nעוד 2 חריגות קמפיין:\n/,
    );

    const one = await run(fakeSupabase(), WEDNESDAY, [snapshot], {
      rules: {
        ...NO_CONTACT_OFF,
        instant: { max_exception_messages_per_run: 0 },
      },
    });
    assertStrictEquals(one.sends.length, 2);
    assertStrictEquals(one.result.sent, 1);
    assertStrictEquals(one.result.summarized, 6);

    const ten = await run(fakeSupabase(), WEDNESDAY, [snapshot], {
      rules: {
        ...NO_CONTACT_OFF,
        instant: { max_exception_messages_per_run: 10 },
      },
    });
    assertStrictEquals(ten.sends.length, 7);
    assertStrictEquals(ten.result.summary_messages, 0);
  },
);

Deno.test(
  "other rule types are not capped and do not use the cap",
  async () => {
    // Five clients, each with no contact and a stale sync (10 alerts), plus
    // seven exceptions on the first client.
    const clients = Array.from({ length: 5 }, (_, i) => ({
      client_id: `c${i + 1}`,
      client_name: `Client ${i + 1}`,
      status: "warning",
      flags: ["סנכרון ישן: Meta"],
      last_client_call_at: null,
    }));
    clients[0] = {
      ...clients[0],
      campaign_breakdown: exceptionCampaigns(7),
    };
    const supabase = fakeSupabase();
    const { result, sends } = await run(supabase, WEDNESDAY, clients);
    const byHeader = (pattern) =>
      sends.filter((send) => pattern.test(send.message)).length;
    assertStrictEquals(byHeader(/אין עדכון קשר/), 5);
    assertStrictEquals(byHeader(/חיבור\/קמפיין/), 5);
    assertStrictEquals(byHeader(/חריגת קמפיין מאומתת/), 3);
    assertStrictEquals(byHeader(/סיכום חריגות קמפיין/), 1);
    assertStrictEquals(sends.length, 14);
    assertStrictEquals(result.sent, 13);
    assertStrictEquals(result.summarized, 4);
    assertStrictEquals(supabase.log.length, 17);
    assertStrictEquals(
      supabase.log.filter((row) => row.evidence?.delivery === "summary").length,
      4,
    );
  },
);

Deno.test(
  "alerts in a summary that is not queued are not logged and go out next run",
  async () => {
    const supabase = fakeSupabase();
    const snapshot = exceptionSnapshot(...exceptionCampaigns(7));
    fakeSupabase.clock = WEDNESDAY.toISOString();
    const sends = [];
    const result = await deliverInstantPulseAlerts({
      supabase,
      tenantId: "t1",
      tenantSlug: "test-tenant",
      pulsePhone: "0501234567",
      snapshots: [snapshot],
      criticalIssues: [],
      rules: NO_CONTACT_OFF,
      queueWhatsApp: async (message, phone) => {
        if (isSummary(message)) return false;
        sends.push({ message, phone });
        return true;
      },
      now: WEDNESDAY,
    });
    assertStrictEquals(sends.length, 3);
    assertStrictEquals(result.sent, 3);
    assertStrictEquals(result.summarized, 0);
    assertStrictEquals(result.summary_messages, 0);
    assertStrictEquals(result.skipped, 4);
    assertStrictEquals(supabase.log.length, 3);

    const next = await run(
      supabase,
      new Date(WEDNESDAY.getTime() + 3600e3),
      [snapshot],
      { rules: NO_CONTACT_OFF },
    );
    assertStrictEquals(next.result.sent, 3);
    assertStrictEquals(next.result.summarized, 1);
    assertStrictEquals(next.result.skipped, 3);
    assertStrictEquals(supabase.log.length, 7);
  },
);

Deno.test(
  "the summary message caps its lines and says how many are left",
  () => {
    const items = (n) =>
      Array.from({ length: n }, (_, i) => ({
        client_name: "Acme",
        campaign_name: `Campaign\n${i + 1}`,
        status_reason: "חריגה מתמשכת",
      }));
    assertStrictEquals(
      buildExceptionSummaryMessage(items(1)),
      [
        SUMMARY_HEADER,
        "עוד חריגת קמפיין אחת:",
        "• Acme · Campaign 1 · חריגה מתמשכת",
        "",
        "AIOS → דשבורד דופק",
      ].join("\n"),
    );
    const seventeen = buildExceptionSummaryMessage(items(17)).split("\n");
    assertStrictEquals(seventeen[1], "עוד 17 חריגות קמפיין:");
    assertStrictEquals(
      seventeen.filter((line) => line.startsWith("• ")).length,
      15,
    );
    assertStrictEquals(seventeen[17], "ועוד 2 בדשבורד הדופק");
    const sixteen = buildExceptionSummaryMessage(items(16)).split("\n");
    assertStrictEquals(sixteen[17], "ועוד אחת בדשבורד הדופק");
    const fifteen = buildExceptionSummaryMessage(items(15));
    assertNotMatch(fifteen, /ועוד/);
  },
);
