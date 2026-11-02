import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import type { PulseSnapshotAlertInput } from "../pulse-instant-alerts.ts";
import {
  campaignNames,
  campaignOf,
  evidenceOf,
  exceptionCampaigns,
  exceptionSnapshot,
  isSummary,
  loggedDeliveries,
  MANAGER_ON_AGENCY_A1,
  MANAGER_PHONE,
  OWNER_PHONE,
  ownerAndManagerClients,
  SUMMARY_HEADER,
  summaryText,
} from "./exception-fixtures.ts";
import { parsePulseInstantRunRules } from "./exception-flood-guard.ts";
import {
  fakeSupabase,
  NO_CONTACT_OFF,
  run,
  WEDNESDAY,
} from "./fake-alert-log.ts";

Deno.test("parsePulseInstantRunRules", async (t) => {
  await t.step(
    "max_exception_messages_per_run is clamped to 1..10, default 3",
    () => {
      const cap = (value: unknown) =>
        parsePulseInstantRunRules({ max_exception_messages_per_run: value })
          .max_exception_messages_per_run;
      assertStrictEquals(
        parsePulseInstantRunRules(null).max_exception_messages_per_run,
        3,
      );
      assertStrictEquals(cap(5), 5);
      assertStrictEquals(cap("6"), 6);
      assertStrictEquals(cap(0), 1);
      assertStrictEquals(cap(-4), 1);
      assertStrictEquals(cap(50), 10);
      assertStrictEquals(cap(2.9), 2);
      assertStrictEquals(cap("many"), 3);
      assertStrictEquals(cap(null), 3);
      assertStrictEquals(cap(true), 3);
    },
  );
});

Deno.test("capExceptionMessages", async (t) => {
  await t.step(
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
      assert(first.sends.every((send) => send.phone === OWNER_PHONE));
      const individual = first.sends.filter((send) => !isSummary(send.message));
      const summaries = first.sends.filter((send) => isSummary(send.message));
      assertStrictEquals(individual.length, 3);
      assertStrictEquals(summaries.length, 1);
      // The three most severe go out on their own, in evaluation order.
      assertEquals(
        individual.map((send) => campaignOf(send.message)),
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
      const { sent, summarized, summary_messages, skipped, wording_calls } =
        first.result;
      assertEquals(
        { sent, summarized, summary_messages, skipped, wording_calls },
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
        supabase.log.map((row) => [String(row.campaign_key), row]),
      );
      for (let i = 1; i <= 7; i++) {
        const row = byKey[`meta:id:c${i}`];
        assert(row, `c${i} logged`);
        assertStrictEquals(row.rule_type, "campaign_exception");
        assertStrictEquals(row.fingerprint, `meta:id:c${i}:סיבה c${i}:cpl:30`);
        assertStrictEquals(row.severity_score, 10 * i);
        assertStrictEquals(row.recipient_phone, OWNER_PHONE);
        assertStrictEquals(
          evidenceOf(row).delivery,
          i <= 4 ? "summary" : undefined,
        );
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

  await t.step("the cap counts per recipient phone", async () => {
    const supabase = fakeSupabase([], MANAGER_ON_AGENCY_A1);
    const { result, sends } = await run(
      supabase,
      WEDNESDAY,
      ownerAndManagerClients(),
      { rules: NO_CONTACT_OFF },
    );
    const owner = sends.filter((send) => send.phone === OWNER_PHONE);
    const manager = sends.filter((send) => send.phone === MANAGER_PHONE);
    assertStrictEquals(owner.length, 4);
    assertStrictEquals(manager.length, 4);
    assertEquals(campaignNames(owner), [
      "Campaign a5",
      "Campaign b1",
      "Campaign b2",
    ]);
    assertEquals(campaignNames(manager), [
      "Campaign a3",
      "Campaign a4",
      "Campaign a5",
    ]);
    assertMatch(summaryText(owner), /\nעוד 4 חריגות קמפיין:\n/);
    assertMatch(summaryText(manager), /\nעוד 2 חריגות קמפיין:\n/);
    assertNotMatch(summaryText(manager), /Beta/);
    // a3 and a4 went out on their own to the manager; only a1 and a2 went out
    // only inside summaries.
    const { sent, summarized, summary_messages, skipped } = result;
    assertEquals(
      { sent, summarized, summary_messages, skipped },
      { sent: 5, summarized: 2, summary_messages: 2, skipped: 0 },
    );
    // One row per message an alert went out in, with the phones it reached:
    // the owner's and the manager's summaries list different alerts.
    assertEquals(loggedDeliveries(supabase.log), [
      `meta:id:a1 summary ${OWNER_PHONE}`,
      `meta:id:a1 summary ${MANAGER_PHONE}`,
      `meta:id:a2 summary ${OWNER_PHONE}`,
      `meta:id:a2 summary ${MANAGER_PHONE}`,
      `meta:id:a3 own ${MANAGER_PHONE}`,
      `meta:id:a3 summary ${OWNER_PHONE}`,
      `meta:id:a4 own ${MANAGER_PHONE}`,
      `meta:id:a4 summary ${OWNER_PHONE}`,
      `meta:id:a5 own ${OWNER_PHONE},${MANAGER_PHONE}`,
      `meta:id:b1 own ${OWNER_PHONE}`,
      `meta:id:b2 own ${OWNER_PHONE}`,
    ]);
  });

  await t.step(
    "max_exception_messages_per_run sets the cap of a run",
    async () => {
      const snapshot = exceptionSnapshot(...exceptionCampaigns(7));
      const withCap = (max: number) =>
        run(fakeSupabase(), WEDNESDAY, [snapshot], {
          rules: {
            ...NO_CONTACT_OFF,
            instant: { max_exception_messages_per_run: max },
          },
        });
      const five = await withCap(5);
      assertStrictEquals(five.sends.length, 6);
      assertStrictEquals(five.result.sent, 5);
      assertStrictEquals(five.result.summarized, 2);
      assertMatch(summaryText(five.sends), /\nעוד 2 חריגות קמפיין:\n/);

      const one = await withCap(0);
      assertStrictEquals(one.sends.length, 2);
      assertStrictEquals(one.result.sent, 1);
      assertStrictEquals(one.result.summarized, 6);

      const ten = await withCap(10);
      assertStrictEquals(ten.sends.length, 7);
      assertStrictEquals(ten.result.summary_messages, 0);
    },
  );

  await t.step(
    "other rule types are not capped and do not use the cap",
    async () => {
      // Five clients, each with no contact and a stale sync (10 alerts), plus
      // seven exceptions on the first client.
      const clients: PulseSnapshotAlertInput[] = Array.from(
        { length: 5 },
        (_, i) => ({
          client_id: `c${i + 1}`,
          client_name: `Client ${i + 1}`,
          status: "warning",
          flags: ["סנכרון ישן: Meta"],
          last_client_call_at: null,
        }),
      );
      clients[0] = { ...clients[0], campaign_breakdown: exceptionCampaigns(7) };
      const supabase = fakeSupabase();
      const { result, sends } = await run(supabase, WEDNESDAY, clients);
      const byHeader = (pattern: RegExp) =>
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
        supabase.log.filter((row) => evidenceOf(row).delivery === "summary")
          .length,
        4,
      );
    },
  );
});
