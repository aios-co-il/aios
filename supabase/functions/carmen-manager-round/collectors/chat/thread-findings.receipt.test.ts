/** threadFindings when the client confirms a wait with a receipt ('קיבלתי'). */
import { assertEquals } from "jsr:@std/assert@1";
import {
  il,
  liveFinding,
  receiptRows,
  REPORT_VERDICT,
  row,
  staffRow,
} from "../../tests/chat-fixtures.ts";
import { findInThreads as find } from "../../tests/fake-chat-sources.ts";
import { THREAD_KINDS as ALL } from "./scope.ts";

Deno.test("threadFindings: a client's receipt", async (t) => {
  const met = {
    needs_reply: false,
    is_request: false,
    complaint_lines: [],
    urgency: "normal",
    summary_he: "הלקוח קיבל את הדוח",
    confidence: 0.9,
  };
  const receipt = receiptRows();
  const readUpToC1 = new Map([
    ["group:111@g.us", { messageId: "c1", verdict: REPORT_VERDICT }],
  ]);

  await t.step(
    "a receipt after the read sends the wait back to the model",
    async () => {
      const found = await find(receipt, {
        reviews: readUpToC1,
        answer: JSON.stringify(met),
      });
      assertEquals(found.asked.length, 1, "'קיבלתי' is read again");
      assertEquals(found.candidates, []);
    },
  );

  await t.step(
    "a receipt is not read once the request is open; the finding keeps the read that raised it",
    async () => {
      const live = [
        liveFinding(
          "unanswered_request",
          "chat:group:111@g.us:c1",
          il("09:00"),
        ),
      ];
      for (const kinds of [ALL, ["unanswered_request" as const]]) {
        const found = await find(
          receipt,
          { live, reviews: readUpToC1, answer: JSON.stringify(met) },
          kinds,
        );
        assertEquals(found.asked.length, 0, "no paid call it cannot use");
        assertEquals(
          found.candidates.map((c) => [
            c.kind,
            c.fingerprint,
            c.evidence.classified_by,
            c.evidence.llm_summary_he,
          ]),
          [
            [
              "unanswered_request",
              "chat:group:111@g.us:c1",
              "llm",
              "הדוח החודשי לא הגיע",
            ],
          ],
        );
      }
    },
  );

  await t.step(
    "an open request keeps its summary when a complaint read also reads the receipt",
    async () => {
      const found = await find(
        [
          staffRow({ message_id: "hi", created_at: il("08:00") }),
          row({
            message_id: "c1",
            created_at: il("09:00"),
            message_text: "מתי יגיע הדוח?",
          }),
          row({
            message_id: "c2",
            created_at: il("09:10"),
            message_text: "קיבלתי, תודה",
          }),
        ],
        {
          live: [
            liveFinding(
              "unanswered_request",
              "chat:group:111@g.us:c1",
              il("09:00"),
            ),
          ],
          answer: JSON.stringify(met),
        },
      );
      assertEquals(found.asked.length, 1, "complaints are still read");
      assertEquals(
        found.candidates.map((c) => [
          c.kind,
          c.fingerprint,
          c.evidence.classified_by,
          c.evidence.llm_summary_he,
        ]),
        [
          [
            "unanswered_request",
            "chat:group:111@g.us:c1",
            "markers",
            undefined,
          ],
        ],
      );
    },
  );

  await t.step(
    "a receipt is not read once a person closed the request",
    async () => {
      for (const kinds of [ALL, ["unanswered_request" as const]]) {
        const found = await find(
          receipt,
          {
            closed: ["unanswered_request|chat:group:111@g.us:c1"],
            reviews: readUpToC1,
            answer: JSON.stringify(met),
          },
          kinds,
        );
        assertEquals(found.asked.length, 0, "no paid call it cannot use");
        assertEquals(found.candidates, []);
      }
    },
  );
});
