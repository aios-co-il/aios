/** threadFindings when a confident model read clears what the markers raised (AIO-517). */
import { assertEquals } from "jsr:@std/assert@1";
import { il, liveFinding, row, staffRow } from "../../tests/chat-fixtures.ts";
import { findInThreads as find } from "../../tests/fake-chat-sources.ts";

/** The model's answer: nothing to answer, no complaint, at `confidence`. */
const calm = (confidence: number) =>
  JSON.stringify({
    needs_reply: false,
    is_request: false,
    complaint_lines: [],
    urgency: "low",
    summary_he: "עדכון חיובי על התנועה",
    confidence,
  });

const asked = () => [
  staffRow({ message_id: "hi", created_at: il("08:00") }),
  row({
    message_id: "c1",
    created_at: il("09:00"),
    message_text: "היה שבוע לא רע, מתי נדבר?",
  }),
];

const kinds = (found: { candidates: Array<{ kind: string }> }) =>
  found.candidates.map((c) => c.kind);

Deno.test("threadFindings: a confident read clears the markers", async (t) => {
  await t.step(
    "a wait the read finds no request in is not raised",
    async () => {
      const found = await find(asked(), { answer: calm(0.9) });
      assertEquals(found.asked.length, 1, "a flagged wait is read");
      assertEquals(kinds(found), []);
    },
  );

  await t.step(
    "an open request the read clears is no longer reported",
    async () => {
      const live = [
        liveFinding(
          "unanswered_request",
          "chat:group:111@g.us:c1",
          il("09:00"),
        ),
      ];
      const found = await find(asked(), { live, answer: calm(0.9) });
      assertEquals(kinds(found), []);
    },
  );

  await t.step(
    "below the drop confidence the markers still decide",
    async () => {
      const found = await find(asked(), { answer: calm(0.7) });
      assertEquals(kinds(found), ["unanswered_request"]);
    },
  );

  await t.step(
    "complaint words the read names no complaint in are cleared",
    async () => {
      const rows = [
        staffRow({ message_id: "hi", created_at: il("08:00") }),
        row({
          message_id: "c1",
          created_at: il("09:00"),
          message_text: "אני לא מרוצה, מטורף לגמרי שבת שלום",
        }),
      ];
      const live = [
        liveFinding(
          "client_complaint",
          "chat:group:111@g.us:complaint:c1",
          il("09:00"),
        ),
      ];
      assertEquals(kinds(await find(rows, { answer: calm(0.9) })), []);
      assertEquals(kinds(await find(rows, { live, answer: calm(0.9) })), []);
      assertEquals(kinds(await find(rows, { answer: calm(0.5) })), [
        "client_complaint",
      ]);
    },
  );

  await t.step(
    "an open complaint an earlier read raised is cleared by a new read",
    async () => {
      const rows = [
        staffRow({ message_id: "hi", created_at: il("08:00") }),
        row({
          message_id: "c1",
          created_at: il("09:00"),
          message_text: "המבצע מסתיים היום",
        }),
      ];
      const live = [
        liveFinding(
          "client_complaint",
          "chat:group:111@g.us:complaint:c1",
          il("09:00"),
        ),
      ];
      assertEquals(kinds(await find(rows, { live, answer: calm(0.9) })), []);
      assertEquals(
        kinds(await find(rows, { live })),
        ["client_complaint"],
        "without a read the stored complaint stays",
      );
    },
  );

  await t.step("a reaction or an empty quote starts no wait", async () => {
    const found = await find([
      staffRow({ message_id: "hi", created_at: il("08:00") }),
      row({
        message_id: "r1",
        created_at: il("09:00"),
        message_text: "[תגובה: ❤️]",
      }),
      row({
        message_id: "q1",
        created_at: il("09:05"),
        message_text: "[quotedMessage]",
      }),
    ]);
    assertEquals([found.asked.length, kinds(found)], [0, []]);
  });
});
