import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";
import { PULSE_ALERT_FOOTER } from "./alert-footer.ts";
import {
  evidenceOf,
  exceptionCampaigns,
  exceptionSnapshot,
  OWNER_PHONE,
  sectionLines,
  sectionTitles,
} from "./exception-fixtures.ts";
import { fakeSupabase, run, TEST_ORG, WEDNESDAY } from "./fake-alert-log.ts";
import {
  buildPulseRunMessage,
  PULSE_RUN_SECTION_MAX_LINES,
} from "./run-message.ts";

const EXCEPTIONS = "🔴 חריגות קמפיין";
const CONNECTION = "🔴 חיבור / קמפיין נעצר";
const NO_CONTACT = "🟡 אין עדכון קשר";
const CPL_SPIKE = "🔴 עליית CPL";

type Alert = Pick<
  PulseInstantAlertCandidate,
  "rule_type" | "line" | "severity_score"
>;

/** `n` alerts of one rule, lines "<rule> 1" … "<rule> n". */
function alerts(rule: Alert["rule_type"], n: number): Alert[] {
  return Array.from({ length: n }, (_, i) => ({
    rule_type: rule,
    line: `${rule} ${i + 1}`,
  }));
}

Deno.test("buildPulseRunMessage", async (t) => {
  await t.step(
    "a header with the org and the Israel date and time, then one footer",
    () => {
      const message = buildPulseRunMessage(
        "DMM",
        WEDNESDAY,
        alerts("no_contact", 1),
      );
      const blocks = message.split("\n\n");
      assertStrictEquals(blocks[0], "🔔 *דופק — DMM* · 28.10.2026, 09:00");
      assertStrictEquals(blocks.at(-1), PULSE_ALERT_FOOTER);
      assertStrictEquals(message.split(PULSE_ALERT_FOOTER).length, 2);
    },
  );

  await t.step(
    "sections keep their order whatever the input order, and an empty one is left out",
    () => {
      const message = buildPulseRunMessage(TEST_ORG, WEDNESDAY, [
        ...alerts("cpl_spike", 1),
        ...alerts("no_contact", 1),
        ...alerts("campaign_exception", 1),
      ]);
      assertEquals(sectionTitles(message), [EXCEPTIONS, NO_CONTACT, CPL_SPIKE]);
    },
  );

  await t.step(
    "each section shows at most N lines and counts the rest, so sections never cut each other",
    () => {
      const over = PULSE_RUN_SECTION_MAX_LINES + 2;
      const message = buildPulseRunMessage(TEST_ORG, WEDNESDAY, [
        ...alerts("campaign_exception", over),
        ...alerts("no_contact", over),
        ...alerts("connection_lost", PULSE_RUN_SECTION_MAX_LINES),
      ]);
      for (const title of [EXCEPTIONS, NO_CONTACT]) {
        const lines = sectionLines(message, title);
        assertStrictEquals(lines.length, PULSE_RUN_SECTION_MAX_LINES + 1);
        assertStrictEquals(lines.at(-1), "ועוד 2");
      }
      const connection = sectionLines(message, CONNECTION);
      assertStrictEquals(connection.length, PULSE_RUN_SECTION_MAX_LINES);
      assert(connection.every((line) => line.startsWith("• ")));
    },
  );

  await t.step(
    "exceptions go most severe first; a line break in a name stays on one line",
    () => {
      const message = buildPulseRunMessage(TEST_ORG, WEDNESDAY, [
        { rule_type: "campaign_exception", line: "mild", severity_score: 5 },
        { rule_type: "campaign_exception", line: "worst", severity_score: 90 },
        { rule_type: "no_contact", line: "Acme\n— לא תועד" },
      ]);
      assertEquals(sectionLines(message, EXCEPTIONS), ["• worst", "• mild"]);
      assertEquals(sectionLines(message, NO_CONTACT), ["• Acme — לא תועד"]);
    },
  );
});

Deno.test("deliverInstantPulseAlerts run message", async (t) => {
  await t.step(
    "exceptions, a lost connection and no contact reach the phone as exactly one message",
    async () => {
      const supabase = fakeSupabase();
      const count = PULSE_RUN_SECTION_MAX_LINES + 3;
      const snapshot = {
        ...exceptionSnapshot(...exceptionCampaigns(count)),
        flags: ["סנכרון ישן: Meta"],
        last_client_call_at: null,
      };
      const { result, sends } = await run(supabase, WEDNESDAY, [snapshot]);

      assertEquals(
        sends.map((send) => send.phone),
        [OWNER_PHONE],
      );
      assertEquals([result.messages, result.sent], [1, count + 2]);
      const [{ message }] = sends;
      assertEquals(sectionTitles(message), [
        EXCEPTIONS,
        CONNECTION,
        NO_CONTACT,
      ]);
      const exceptions = sectionLines(message, EXCEPTIONS);
      assertStrictEquals(
        exceptions[0],
        `• Acme — Campaign c${count} — סיבה c${count} — 3 ימים: 52 · 7 ימים: 48 · יעד: CPL 30`,
      );
      assertStrictEquals(exceptions.length, PULSE_RUN_SECTION_MAX_LINES + 1);
      assertStrictEquals(exceptions.at(-1), "ועוד 3");
      assertEquals(sectionLines(message, CONNECTION), [
        "• Acme — סנכרון ישן: Meta",
      ]);
      assertEquals(sectionLines(message, NO_CONTACT), ["• Acme — לא תועד"]);

      // Every alert is logged once, with the text the phone got.
      assertStrictEquals(supabase.log.length, count + 2);
      for (const row of supabase.log) {
        assertEquals(
          [row.message, row.recipient_phone, evidenceOf(row).delivery],
          [message, OWNER_PHONE, "digest"],
        );
      }
    },
  );
});
