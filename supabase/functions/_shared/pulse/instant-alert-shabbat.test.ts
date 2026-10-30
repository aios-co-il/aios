import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import type { PulseSnapshotAlertInput } from "../pulse-instant-alerts.ts";
import {
  fakeSupabase,
  healthy,
  NO_CONTACT_OFF,
  run,
  WEDNESDAY,
} from "./fake-alert-log.ts";
import { isPulseAlertHeldForShabbat } from "./instant-alert-shabbat.ts";

const SATURDAY_11 = new Date("2026-10-31T09:00:00Z"); // 11:00 Israel
const SUNDAY_06 = new Date("2026-11-01T04:00:00Z"); // 06:00 Israel
type Issue = { clientId: string; alertType: string };

Deno.test("isPulseAlertHeldForShabbat", async (t) => {
  await t.step(
    "on Saturday only a Shabbat-critical connection_lost goes out",
    () => {
      const lost = { rule_type: "connection_lost" as const };
      assertStrictEquals(
        isPulseAlertHeldForShabbat(
          { ...lost, shabbat_critical: true },
          SATURDAY_11,
        ),
        false,
      );
      assertStrictEquals(
        isPulseAlertHeldForShabbat(
          { ...lost, shabbat_critical: false },
          SATURDAY_11,
        ),
        true,
      );
      assertStrictEquals(isPulseAlertHeldForShabbat(lost, SATURDAY_11), true);
      assertStrictEquals(
        isPulseAlertHeldForShabbat(
          { rule_type: "cpl_spike", shabbat_critical: true },
          SATURDAY_11,
        ),
        true,
      );
      assertStrictEquals(
        isPulseAlertHeldForShabbat({ rule_type: "no_contact" }, WEDNESDAY),
        false,
      );
    },
  );
});

Deno.test("deliverInstantPulseAlerts on Shabbat", async (t) => {
  await t.step(
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

      const lateSaturday = await run(
        supabase,
        new Date("2026-10-31T21:30:00Z"),
      ); // 23:30 Israel
      assertStrictEquals(lateSaturday.result.sent, 0);

      const sunday = await run(supabase, new Date("2026-11-01T04:00:00Z")); // 06:00 Israel
      assertStrictEquals(sunday.result.sent, 1);
      assertStrictEquals(
        sunday.sends[0].message.includes("אין עדכון קשר"),
        true,
      );
      // Still inside connection_lost's 24h throttle and no_contact's 7 days.
      const sundayLater = await run(supabase, new Date("2026-11-01T07:00:00Z"));
      assertStrictEquals(sundayLater.result.sent, 0);
    },
  );

  await t.step(
    "on Saturday a connection_lost made only of single-campaign issues is held, then sent once after Shabbat",
    async () => {
      const cases: Array<{ label: string; flags: string[]; issues: Issue[] }> =
        [
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

  await t.step(
    "on Saturday a real connection loss still goes out",
    async () => {
      const cases: Array<{
        label: string;
        snapshot: PulseSnapshotAlertInput;
        issues: Issue[];
      }> = [
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
          snapshot: {
            ...healthy(["אין טבלת קמפיין מחוברת"]),
            status: "no_data",
          },
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
    },
  );
});
