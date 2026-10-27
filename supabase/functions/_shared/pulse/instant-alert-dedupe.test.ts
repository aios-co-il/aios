import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  DEFAULT_PULSE_ALERT_RULES,
  evaluatePulseInstantAlerts,
} from "../pulse-instant-alerts.ts";
import { ACME, fakeSupabase, run, WEDNESDAY } from "./fake-alert-log.ts";
import {
  decideInstantAlertDelivery,
  isSameInstantAlertFinding,
} from "./instant-alert-dedupe.ts";

Deno.test("legacyRuleFingerprint", async (t) => {
  await t.step("client-level rules get deterministic fingerprints", () => {
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
    assertStrictEquals(first.result.sent, 2); // no_contact + connection_lost
    assertStrictEquals(first.sends.length, 2);
    const second = await run(supabase, new Date(WEDNESDAY.getTime() + 3600e3));
    assertStrictEquals(second.result.sent, 0);
    assertStrictEquals(second.sends.length, 0);
    assertStrictEquals(supabase.log.length, 2);
    assert(supabase.log.every((row) => row.fingerprint));
  });

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
