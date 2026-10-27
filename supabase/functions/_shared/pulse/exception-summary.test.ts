import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  consoleErrorsOf,
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
} from "./exception-fixtures.ts";
import { buildExceptionSummaryMessage } from "./exception-summary.ts";
import {
  fakeSupabase,
  NO_CONTACT_OFF,
  run,
  WEDNESDAY,
} from "./fake-alert-log.ts";

Deno.test("buildExceptionSummaryMessage", async (t) => {
  await t.step(
    "the summary message caps its lines and says how many are left",
    () => {
      const items = (n: number) =>
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
});

Deno.test("sendExceptionSummaries", async (t) => {
  await t.step(
    "a summary row logs the summary text the phone received, not the alert's own message",
    async () => {
      const supabase = fakeSupabase([], MANAGER_ON_AGENCY_A1);
      const { sends } = await run(
        supabase,
        WEDNESDAY,
        ownerAndManagerClients(),
        {
          rules: NO_CONTACT_OFF,
          phraseException: async () => ({ summary: "הקמפיין מעל היעד" }),
        },
      );
      const summaryTo = (phone: string) =>
        sends.find((send) => send.phone === phone && isSummary(send.message))
          ?.message;
      const rowOf = (key: string, delivery: string, phone: string) =>
        supabase.log.find(
          (row) =>
            row.campaign_key === key &&
            (evidenceOf(row).delivery ?? "own") === delivery &&
            row.recipient_phone === phone,
        );

      // a3 went out on its own to the manager, with model wording, and inside
      // the owner's summary.
      const own = rowOf("meta:id:a3", "own", MANAGER_PHONE);
      const summary = rowOf("meta:id:a3", "summary", OWNER_PHONE);
      assertMatch(String(own?.message), /סיכום כרמן: הקמפיין מעל היעד/);
      assertStrictEquals(evidenceOf(own ?? {}).ai_wording !== undefined, true);
      assertStrictEquals(summary?.message, summaryTo(OWNER_PHONE));
      assertStrictEquals(evidenceOf(summary ?? {}).ai_wording, undefined);
      assertStrictEquals(
        rowOf("meta:id:a1", "summary", MANAGER_PHONE)?.message,
        summaryTo(MANAGER_PHONE),
      );
    },
  );

  await t.step(
    "alerts in a summary that is not queued are reported, not logged, and go out next run",
    async () => {
      const supabase = fakeSupabase();
      const snapshot = exceptionSnapshot(...exceptionCampaigns(7));
      const sends: Array<{ message: string; phone: string | null }> = [];
      const errors = await consoleErrorsOf(async () => {
        const { result } = await run(supabase, WEDNESDAY, [snapshot], {
          rules: NO_CONTACT_OFF,
          queueWhatsApp: async (message, phone) => {
            if (isSummary(message)) {
              return false;
            }

            sends.push({ message, phone });
            return true;
          },
        });
        assertStrictEquals(result.sent, 3);
        assertStrictEquals(result.summarized, 0);
        assertStrictEquals(result.summary_messages, 0);
        assertStrictEquals(result.skipped, 4);
      });
      assertEquals(errors.length, 1);
      assertMatch(String(errors[0][0]), /summary not queued/);
      assertEquals(errors[0][1], {
        tenant_id: "t1",
        campaign_keys: ["meta:id:c4", "meta:id:c3", "meta:id:c2", "meta:id:c1"],
      });
      assertStrictEquals(sends.length, 3);
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

  await t.step(
    "a phone whose summary is not queued is not logged for its alerts",
    async () => {
      const supabase = fakeSupabase([], MANAGER_ON_AGENCY_A1);
      const { result } = await run(
        supabase,
        WEDNESDAY,
        ownerAndManagerClients(),
        {
          rules: NO_CONTACT_OFF,
          queueWhatsApp: async (message, phone) =>
            !(isSummary(message) && phone === OWNER_PHONE),
        },
      );
      const { sent, summarized, summary_messages, skipped } = result;
      assertEquals(
        { sent, summarized, summary_messages, skipped },
        { sent: 5, summarized: 2, summary_messages: 1, skipped: 0 },
      );
      // a3 and a4 reached only the manager; the owner's phone is in no row
      // for a1..a4, so cross-org dedupe does not count it as alerted.
      assertEquals(loggedDeliveries(supabase.log), [
        `meta:id:a1 summary ${MANAGER_PHONE}`,
        `meta:id:a2 summary ${MANAGER_PHONE}`,
        `meta:id:a3 own ${MANAGER_PHONE}`,
        `meta:id:a4 own ${MANAGER_PHONE}`,
        `meta:id:a5 own ${OWNER_PHONE},${MANAGER_PHONE}`,
        `meta:id:b1 own ${OWNER_PHONE}`,
        `meta:id:b2 own ${OWNER_PHONE}`,
      ]);
    },
  );

  await t.step(
    "a failed log insert leaves the counts adding up to the candidates",
    async () => {
      const supabase = fakeSupabase();
      supabase.insertError = "connection reset";
      const snapshot = exceptionSnapshot(...exceptionCampaigns(7));
      const errors = await consoleErrorsOf(async () => {
        const { result, sends } = await run(supabase, WEDNESDAY, [snapshot], {
          rules: NO_CONTACT_OFF,
        });
        assertStrictEquals(sends.length, 4);
        const { sent, summarized, summary_messages, skipped, candidates } =
          result;
        assertEquals(
          { sent, summarized, summary_messages, skipped, candidates },
          {
            sent: 3,
            summarized: 4,
            summary_messages: 1,
            skipped: 0,
            candidates: 7,
          },
        );
      });
      assertStrictEquals(errors.length, 7);
      assertStrictEquals(supabase.log.length, 0);
    },
  );
});
