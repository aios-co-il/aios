import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  exceptionSnapshot,
  sectionLines,
  sectionTitles,
} from "./exception-fixtures.ts";
import { ACME, fakeSupabase, run, WEDNESDAY } from "./fake-alert-log.ts";
import {
  decideInstantAlertDelivery,
  isSameInstantAlertFinding,
  ownRecentDeliveries,
  phonesStillDue,
} from "./instant-alert-dedupe.ts";

Deno.test("ownRecentDeliveries", async (t) => {
  await t.step(
    "a failed dedupe lookup answers null, so the planner skips instead of resending",
    async () => {
      const rows = await ownRecentDeliveries(
        {
          supabase: fakeSupabase([], { failing: ["pulse_instant_alert_log"] }),
          tenantId: "t1",
        },
        {
          client_id: "c1",
          client_name: "Acme",
          rule_type: "connection_lost",
          line: "",
          fingerprint: "connection_lost:c1:open",
        },
        24,
        WEDNESDAY,
      );
      assertStrictEquals(rows, null);
    },
  );
});

Deno.test("phonesStillDue", async (t) => {
  const exception = {
    rule_type: "campaign_exception" as const,
    fingerprint: "k",
    severity_score: 52,
  };

  await t.step(
    "each phone is judged on the rows that reached it, 10% rule included",
    () => {
      // Newest first: A got it at 50, A and B at 40 before that.
      const rows = [
        { fingerprint: "k", severity_score: 50, recipient_phone: "A" },
        { fingerprint: "k", severity_score: 40, recipient_phone: "A,B" },
      ];
      assertEquals(phonesStillDue(exception, ["A", "B", "C"], rows), [
        "B",
        "C",
      ]);
    },
  );

  await t.step("a row that lists no phone holds every phone", () => {
    for (const recipient_phone of [null, ""]) {
      assertEquals(
        phonesStillDue(
          { rule_type: "no_contact", fingerprint: "k" },
          ["A", "B"],
          [{ fingerprint: "k", recipient_phone }],
        ),
        [],
      );
    }
  });
});

Deno.test("isSameInstantAlertFinding", async (t) => {
  await t.step("fingerprint comparison treats undefined and null alike", () => {
    assertStrictEquals(isSameInstantAlertFinding(null, undefined), true);
    assertStrictEquals(isSameInstantAlertFinding(undefined, "x"), true); // legacy row
    assertStrictEquals(isSameInstantAlertFinding("x", "x"), true);
    assertStrictEquals(isSameInstantAlertFinding("x", "y"), false);
    assertStrictEquals(isSameInstantAlertFinding("x", undefined), false);
  });
});

Deno.test("decideInstantAlertDelivery", async (t) => {
  await t.step(
    "a finding that flaps back inside the window is not resent",
    () => {
      const rows = [{ fingerprint: "b" }, { fingerprint: "a" }];
      assertEquals(
        decideInstantAlertDelivery(
          { rule_type: "connection_lost", fingerprint: "a" },
          rows,
        ),
        { send: false, reason: "duplicate" },
      );
    },
  );

  await t.step(
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
});

Deno.test("deliverInstantPulseAlerts dedupe", async (t) => {
  await t.step("two identical runs send each finding once", async () => {
    const supabase = fakeSupabase();
    const first = await run(supabase, WEDNESDAY);
    // no_contact and connection_lost, in one run message
    assertStrictEquals(first.result.sent, 2);
    assertStrictEquals(first.sends.length, 1);
    const second = await run(supabase, new Date(WEDNESDAY.getTime() + 3600e3));
    assertStrictEquals(second.result.sent, 0);
    assertStrictEquals(second.sends.length, 0);
    assertStrictEquals(supabase.log.length, 2);
    assert(supabase.log.every((row) => row.fingerprint));
  });

  await t.step(
    "an alert sent in a run message is not resent inside its throttle window; the next message lists only the new one",
    async () => {
      const supabase = fakeSupabase();
      await run(supabase, WEDNESDAY);
      const later = await run(
        supabase,
        new Date(WEDNESDAY.getTime() + 3600e3),
        [
          {
            ...ACME,
            campaign_breakdown: exceptionSnapshot().campaign_breakdown,
          },
        ],
      );
      assertStrictEquals(later.sends.length, 1);
      assertEquals(sectionTitles(later.sends[0].message), ["🔴 חריגות קמפיין"]);
      assertEquals(
        sectionLines(later.sends[0].message, "🔴 חריגות קמפיין").length,
        1,
      );
      assertStrictEquals(later.result.skipped, 2);
    },
  );

  await t.step(
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

  await t.step(
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
      const { result } = await run(supabase, WEDNESDAY, [
        { ...ACME, flags: [] },
      ]);
      assertStrictEquals(result.sent, 1);
    },
  );
});
