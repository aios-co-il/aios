import { assertEquals } from "jsr:@std/assert@1";
import type { ContactEvidence } from "./evidence.ts";
import { noContactFindings } from "./no-contact.ts";

const NOW = new Date("2026-11-03T10:00:00Z");
const RULES = {
  logGraceHours: 24,
  minCallSeconds: 60,
  noContactEnabled: true,
  noContactDays: 14,
};

/** A long-standing client with no contact or log on record. */
function client(fields: Partial<ContactEvidence> = {}): ContactEvidence {
  return {
    clientId: "c1",
    clientName: "לקוח א",
    agencyId: "a1",
    clientSince: "2025-01-01T00:00:00Z",
    lastLogAt: null,
    lastContactAt: null,
    unloggedCall: null,
    unloggedMeeting: null,
    ...fields,
  };
}

Deno.test("noContactFindings", async (t) => {
  await t.step(
    "a silence that crossed the threshold is dated when it crossed",
    () => {
      const [finding] = noContactFindings(
        [client({ lastLogAt: "2026-10-15T10:00:00Z" })],
        RULES,
        NOW,
      );
      assertEquals(finding.kind, "no_contact");
      assertEquals(finding.fingerprint, "client:c1");
      assertEquals(finding.source_event_at, "2026-10-29T10:00:00.000Z");
      assertEquals(
        finding.summary_he,
        "לקוח א: אין שיחה, פגישה או הודעה מתועדת עם הלקוח מאז 15.10",
      );
      assertEquals(finding.owner_user_id, null);
    },
  );

  await t.step("any recent contact or log keeps the client fine", () => {
    const recent = "2026-11-01T10:00:00Z";
    for (const fields of [{ lastContactAt: recent }, { lastLogAt: recent }]) {
      assertEquals(noContactFindings([client(fields)], RULES, NOW), []);
    }
  });

  await t.step("a client younger than the threshold is not silent yet", () => {
    const fresh = client({ clientSince: "2026-10-25T00:00:00Z" });
    assertEquals(noContactFindings([fresh], RULES, NOW), []);
    const [late] = noContactFindings(
      [client({ clientSince: "2026-10-10T00:00:00Z" })],
      RULES,
      NOW,
    );
    assertEquals(late.source_event_at, "2026-10-24T00:00:00.000Z");
  });

  await t.step(
    "with nothing known the event predates the window, so it never alerts",
    () => {
      const [finding] = noContactFindings(
        [client({ clientSince: null })],
        { ...RULES, noContactDays: 30 },
        NOW,
      );
      assertEquals(finding.source_event_at, "2026-10-04T10:00:00.000Z");
      assertEquals(
        finding.summary_he,
        "לקוח א: אין שיחה, פגישה או הודעה מתועדת עם הלקוח ב־30 הימים האחרונים",
      );
    },
  );
});
