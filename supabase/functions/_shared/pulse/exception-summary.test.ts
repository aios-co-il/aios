import { assertNotMatch, assertStrictEquals } from "jsr:@std/assert@1";
import {
  consoleErrorsOf,
  exceptionCampaigns,
  exceptionSnapshot,
  isSummary,
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
    "alerts in a summary that is not queued are not logged and go out next run",
    async () => {
      const supabase = fakeSupabase();
      const snapshot = exceptionSnapshot(...exceptionCampaigns(7));
      const sends: Array<{ message: string; phone: string | null }> = [];
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

  await t.step(
    "a summarized alert whose log insert fails is not counted",
    async () => {
      const supabase = fakeSupabase();
      supabase.insertError = "connection reset";
      const snapshot = exceptionSnapshot(...exceptionCampaigns(7));
      const errors = await consoleErrorsOf(async () => {
        const { result, sends } = await run(supabase, WEDNESDAY, [snapshot], {
          rules: NO_CONTACT_OFF,
        });
        assertStrictEquals(sends.length, 4);
        assertStrictEquals(result.sent, 3);
        assertStrictEquals(result.summary_messages, 1);
        assertStrictEquals(result.summarized, 0);
        assertStrictEquals(result.skipped, 0);
      });
      assertStrictEquals(errors.length, 7);
      assertStrictEquals(supabase.log.length, 0);
    },
  );
});
