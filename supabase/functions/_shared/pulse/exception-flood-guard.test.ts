import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  DEFAULT_PULSE_ALERT_RULES,
  type PulseSnapshotAlertInput,
} from "../pulse-instant-alerts.ts";
import {
  campaignNames,
  campaignOf,
  evidenceOf,
  exceptionCampaigns,
  exceptionSnapshot,
  isSummary,
  SUMMARY_HEADER,
  summaryText,
} from "./exception-fixtures.ts";
import { maxExceptionMessagesPerRun } from "./exception-flood-guard.ts";
import {
  fakeSupabase,
  NO_CONTACT_OFF,
  run,
  WEDNESDAY,
} from "./fake-alert-log.ts";

Deno.test("maxExceptionMessagesPerRun", async (t) => {
  await t.step(
    "max_exception_messages_per_run overrides the cap, clamped to 1..10",
    () => {
      assertStrictEquals(maxExceptionMessagesPerRun(null), 3);
      assertStrictEquals(
        maxExceptionMessagesPerRun(DEFAULT_PULSE_ALERT_RULES),
        3,
      );
      const cap = (value: unknown) =>
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
      assert(first.sends.every((send) => send.phone === "972501234567"));
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
        assertStrictEquals(row.recipient_phone, "972501234567");
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
    // The owner sees both clients; the manager only client c1 (agency a1).
    const supabase = fakeSupabase([], {
      user_roles: [{ tenant_id: "t1", user_id: "m1", role: "team_manager" }],
      user_managed_agencies: [{ user_id: "m1", agency_id: "a1" }],
      profiles: [
        {
          id: "m1",
          full_name: "Manager",
          campaigners: { phone: "0529999999" },
        },
      ],
    });
    const c1: PulseSnapshotAlertInput = {
      ...exceptionSnapshot(...exceptionCampaigns(5, "a")),
      agency_id: "a1",
    };
    const c2: PulseSnapshotAlertInput = {
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
    const owner = sends.filter((send) => send.phone === "972501234567");
    const manager = sends.filter((send) => send.phone === "972529999999");
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
    assertStrictEquals(supabase.log.length, 7);
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
