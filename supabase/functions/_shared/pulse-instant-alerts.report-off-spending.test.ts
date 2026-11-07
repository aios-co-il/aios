/**
 * A switched-off report that still spends, in the pulse run (AIO-501): when
 * deliverInstantPulseAlerts sends report_off_spending, and when it stays
 * quiet. The snapshot side (which tables are read, and over which days) is
 * campaign-pulse-snapshot/report-tables.test.ts.
 */
import {
  assertEquals,
  assertStrictEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import {
  evaluatePulseInstantAlerts,
  type PulseSnapshotAlertInput,
} from "./pulse-instant-alerts.ts";
import {
  fakeSupabase,
  healthy,
  NO_CONTACT_OFF,
  run,
  WEDNESDAY,
} from "./pulse/fake-alert-log.ts";
import type { OffReportSpend } from "./pulse/report-off-spending.ts";

const DAY_MS = 24 * 3600e3;

const ARCHI_SALT: OffReportSpend = {
  table_id: "t-off",
  table_name: "Archi.Salt",
  spend_3d: 283,
  window_start: "2026-10-25",
  window_end: "2026-10-27",
};

/** Client c1, contacted, with these switched-off tables' recent spend. */
function offSpending(
  items: Array<OffReportSpend> = [ARCHI_SALT],
): PulseSnapshotAlertInput {
  return { ...healthy(), off_report_spend: items };
}

/** A pulse run of that client; no_contact is off, so only this rule speaks. */
function runWith(
  supabase: ReturnType<typeof fakeSupabase>,
  at: Date,
  snapshot = offSpending(),
  rules: Record<string, unknown> = NO_CONTACT_OFF,
) {
  return run(supabase, at, [snapshot], { rules });
}

Deno.test(
  "pulse alert for a switched-off report that still spends",
  async (t) => {
    await t.step(
      "spend in the last 3 full days sends one alert naming the table and the spend",
      async () => {
        const supabase = fakeSupabase();
        const { result, sends } = await runWith(supabase, WEDNESDAY);
        assertStrictEquals(result.sent, 1);
        assertStrictEquals(sends.length, 1);
        assertStringIncludes(sends[0].message, "🟠 דוח כבוי שעדיין מוציא");
        assertStringIncludes(
          sends[0].message,
          '• Acme — דוח "Archi.Salt" כבוי אבל הוציא ₪283 ב-3 הימים האחרונים',
        );
        assertEquals(
          supabase.log.map((row) => [
            row.tenant_id,
            row.client_id,
            row.rule_type,
            row.campaign_key,
            row.fingerprint,
          ]),
          [
            [
              "t1",
              "c1",
              "report_off_spending",
              "report_off:t-off",
              "report_off_spending:c1:t-off",
            ],
          ],
        );
      },
    );

    await t.step("no spend, no alert", async () => {
      for (const snapshot of [
        offSpending([]),
        offSpending([{ ...ARCHI_SALT, spend_3d: 0 }]),
        healthy(),
      ]) {
        const { sends } = await runWith(fakeSupabase(), WEDNESDAY, snapshot);
        assertStrictEquals(sends.length, 0);
      }
    });

    await t.step(
      "dedupe: not again within the week, while it keeps spending",
      async () => {
        const supabase = fakeSupabase();
        await runWith(supabase, WEDNESDAY);
        for (const later of [3600e3, 2 * DAY_MS, 6 * DAY_MS]) {
          const { sends } = await runWith(
            supabase,
            new Date(WEDNESDAY.getTime() + later),
            offSpending([{ ...ARCHI_SALT, spend_3d: 500 }]),
          );
          assertStrictEquals(sends.length, 0, `${later / 3600e3}h later`);
        }
      },
    );

    await t.step(
      "another org's log row does not dedupe this org's alert",
      async () => {
        const supabase = fakeSupabase([
          {
            tenant_id: "t-other",
            client_id: "c1",
            rule_type: "report_off_spending",
            campaign_key: "report_off:t-off",
            fingerprint: "report_off_spending:c1:t-off",
            recipient_phone: "972501234567",
            sent_at: WEDNESDAY.toISOString(),
          },
        ]);
        const { sends } = await runWith(supabase, WEDNESDAY);
        assertStrictEquals(sends.length, 1);
      },
    );

    await t.step(
      "follows the pulse switches: this rule and instant WhatsApp",
      async () => {
        for (const rules of [
          { ...NO_CONTACT_OFF, report_off_spending_enabled: false },
          { ...NO_CONTACT_OFF, instant_wa_enabled: false },
        ]) {
          const { sends } = await runWith(
            fakeSupabase(),
            WEDNESDAY,
            offSpending(),
            rules,
          );
          assertStrictEquals(sends.length, 0);
        }
      },
    );

    await t.step("is held on Shabbat: it is not a critical alert", async () => {
      const saturday = new Date("2026-10-31T07:00:00Z");
      const { result, sends } = await runWith(fakeSupabase(), saturday);
      assertStrictEquals(sends.length, 0);
      assertStrictEquals(result.held, 1);
    });

    await t.step(
      "its spend raises only this rule, never a campaign exception",
      () => {
        const candidates = evaluatePulseInstantAlerts(
          [offSpending()],
          [],
          NO_CONTACT_OFF,
          WEDNESDAY.getTime(),
        );
        assertEquals(
          candidates.map((candidate) => candidate.rule_type),
          ["report_off_spending"],
        );
      },
    );
  },
);
