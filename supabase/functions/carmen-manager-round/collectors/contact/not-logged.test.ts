import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import type { ContactEvidence } from "./evidence.ts";
import { notLoggedFindings } from "./not-logged.ts";

// Tuesday 2026-11-03 12:00 Israel time.
const NOW = new Date("2026-11-03T10:00:00Z");
const RULES = {
  logGraceHours: 24,
  minCallSeconds: 60,
  noContactEnabled: true,
  noContactDays: 14,
};
const CALL_AT = "2026-11-02T08:00:00Z";

function client(fields: Partial<ContactEvidence> = {}): ContactEvidence {
  return {
    clientId: "c1",
    clientName: "לקוח א",
    agencyId: "a1",
    clientSince: "2025-01-01T00:00:00Z",
    lastLogAt: null,
    lastContactAt: CALL_AT,
    unloggedCall: {
      id: "call-1",
      at: CALL_AT,
      seconds: 240,
      attributedUserId: "dana",
      attributedName: "דנה כהן",
    },
    unloggedMeeting: null,
    ...fields,
  };
}

Deno.test("notLoggedFindings", async (t) => {
  await t.step("an unlogged call goes to the caller with a draft", () => {
    const [finding] = notLoggedFindings([client()], RULES, NOW);
    assertEquals(finding.kind, "contact_not_logged");
    assertEquals(finding.fingerprint, "client:c1:call:call-1");
    assertEquals(finding.owner_user_id, "dana");
    assertEquals(finding.source_event_at, CALL_AT);
    assertEquals(finding.evidence.attributed, true);
    assertEquals(finding.evidence.draft, {
      update_type: "call",
      text_he: "שיחה טלפונית עם הלקוח ב־2.11 (4 דק')",
    });
    assertStringIncludes(finding.summary_he, "לקוח א: שיחה של דנה כהן");
    assertStringIncludes(finding.summary_he, '"תעדי" ומספר הפריט');
  });

  await t.step("an office-line call names nobody", () => {
    const call = {
      id: "call-2",
      at: CALL_AT,
      seconds: 90,
      attributedUserId: null,
      attributedName: null,
    };
    const [finding] = notLoggedFindings(
      [client({ unloggedCall: call })],
      RULES,
      NOW,
    );
    assertEquals(finding.owner_user_id, null);
    assertEquals(finding.evidence.attributed, false);
    assertEquals(finding.evidence.caller_user_id, null);
    assertStringIncludes(finding.summary_he, "שיחה מקו המשרד, נציג לא מזוהה");
  });

  await t.step("a call still inside the log grace is not due yet", () => {
    const early = new Date("2026-11-03T07:59:00Z");
    assertEquals(notLoggedFindings([client()], RULES, early), []);
    assertEquals(
      notLoggedFindings([client({ unloggedCall: null })], RULES, NOW),
      [],
    );
  });

  await t.step("a meeting drafts from its recording summary", () => {
    const meeting = {
      id: "m-1",
      key: "zoom:zm1",
      at: "2026-11-01T09:00:00Z",
      source: "meeting_bot",
      summary: "## סיכום\n* הוחלט להגדיל **תקציב**",
    };
    const findings = notLoggedFindings(
      [client({ unloggedCall: null, unloggedMeeting: meeting })],
      RULES,
      NOW,
    );
    assertEquals(
      findings.map((f) => f.fingerprint),
      ["client:c1:meeting:zoom:zm1"],
    );
    assertEquals(findings[0].owner_user_id, null);
    assertEquals(findings[0].evidence.draft, {
      update_type: "meeting",
      text_he: "פגישה עם הלקוח ב־1.11. סיכום: סיכום הוחלט להגדיל תקציב",
    });
    assertStringIncludes(findings[0].summary_he, "יש טיוטה מסיכום ההקלטה");
  });

  await t.step(
    "a meeting is one finding whichever recording file is read",
    () => {
      const file = (id: string) =>
        notLoggedFindings(
          [
            client({
              unloggedCall: null,
              unloggedMeeting: {
                id,
                key: "zoom:zm1",
                at: "2026-11-01T09:00:00Z",
                source: "recording",
                summary: null,
              },
            }),
          ],
          RULES,
          NOW,
        )[0].fingerprint;
      assertEquals(file("rec-1"), file("rec-2"));
    },
  );
});
