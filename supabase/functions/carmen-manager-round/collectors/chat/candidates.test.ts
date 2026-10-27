import { assert, assertEquals } from "jsr:@std/assert@1";
import { dmRow, il, review, row, thread } from "../../tests/chat-fixtures.ts";
import { waitCandidates } from "./candidates.ts";
import type { ChatVerdict } from "./verdict.ts";

const link = (id: string) => `https://app.test/t/acme/chat/${id}`;
const noLink = () => null;

const confident: ChatVerdict = {
  needs_reply: true,
  is_request: true,
  is_complaint: false,
  urgency: "normal",
  summary_he: "מבקש לעדכן את המבצע",
  confidence: 0.9,
};

Deno.test("waitCandidates", async (t) => {
  await t.step("a group request past the SLA quotes the client", () => {
    const text = `אפשר להעלות את המבצע החדש? ${"פרטים ".repeat(60)}`;
    const [found] = waitCandidates(
      [
        review(thread([row({ created_at: il("09:05"), message_text: text })]), {
          markers: { request: true, complaint: false },
        }),
      ],
      noLink,
    );
    assertEquals(
      [found.kind, found.severity, found.client_id],
      ["unanswered_request", "warning", "c1"],
    );
    assert(
      found.summary_he.startsWith(
        'לקוח א: הלקוח כתב בקבוצה ב-27.10 בשעה 09:05: "אפשר להעלות',
      ),
    );
    assert(found.summary_he.endsWith("ועדיין לא קיבל מענה (5 שעות עסקיות)"));
    const quote = String(found.evidence.quote);
    assertEquals([quote.length, quote.endsWith("…")], [200, true]);
    assertEquals(found.source_event_at, il("09:05"));
  });

  await t.step(
    "a direct chat carries the time and a link, never the text",
    () => {
      const secret = "סוד פרטי מאוד?";
      const found = waitCandidates(
        [
          review(thread([dmRow({ message_text: secret })]), {
            markers: { request: true, complaint: true },
          }),
        ],
        link,
      );
      assertEquals(
        found.map((c) => c.kind),
        ["unanswered_request", "client_complaint"],
      );
      for (const candidate of found) {
        const visible =
          candidate.summary_he + JSON.stringify(candidate.evidence);
        assert(!visible.includes("סוד"), visible);
        assert(
          candidate.summary_he.includes(
            "לצ׳אט: https://app.test/t/acme/chat/c1",
          ),
        );
      }
    },
  );

  await t.step("the LLM may add a request, never remove the markers'", () => {
    const quiet = thread([row({ message_text: "יש עדכון" })]);
    assertEquals(waitCandidates([review(quiet)], noLink), []);
    assertEquals(
      waitCandidates([review(quiet, { verdict: confident })], noLink).map(
        (c) => c.kind,
      ),
      ["unanswered_request"],
    );
    const denied = review(quiet, {
      markers: { request: true, complaint: false },
      verdict: { ...confident, is_request: false, needs_reply: false },
    });
    assertEquals(
      waitCandidates([denied], noLink).map((c) => c.kind),
      ["unanswered_request"],
    );
  });

  await t.step(
    "before the SLA only a complaint is raised; open kinds stay",
    () => {
      const early = thread([
        row({ message_text: "אני לא מרוצה, מתי זה יסתדר?" }),
      ]);
      const fresh = review(early, {
        slaBreached: false,
        markers: { request: true, complaint: true },
      });
      const [complaint] = waitCandidates([fresh], noLink);
      assertEquals(complaint.kind, "client_complaint");
      assert(
        complaint.summary_he.includes(
          'נראה שהלקוח מתלונן בקבוצה ב-27.10 בשעה 09:00: "אני לא מרוצה',
        ),
      );
      const kept = review(thread([row({ message_text: "שלום" })]), {
        openKinds: ["unanswered_request"],
      });
      assertEquals(
        waitCandidates([kept], noLink).map((c) => c.kind),
        ["unanswered_request"],
      );
    },
  );

  await t.step(
    "a wait only from unmapped @lid senders is low confidence",
    () => {
      const unsure = thread([
        row({
          sender_match_key: null,
          sender_lid_unmapped: true,
          message_text: "מתי?",
        }),
      ]);
      const [found] = waitCandidates(
        [review(unsure, { markers: { request: true, complaint: false } })],
        noLink,
      );
      assertEquals(
        [found.severity, found.evidence.low_confidence],
        ["info", true],
      );
      assert(found.summary_he.includes("(השולח לא זוהה בוודאות)"));
    },
  );
});
