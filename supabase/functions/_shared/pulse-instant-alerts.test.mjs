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
  decideInstantAlertDelivery,
  deliverInstantPulseAlerts,
  evaluatePulseInstantAlerts,
  instantPulseAlertsGate,
  isSameInstantAlertFinding,
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
