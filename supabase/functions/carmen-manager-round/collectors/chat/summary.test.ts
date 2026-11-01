import { assertEquals } from "jsr:@std/assert@1";
import {
  il,
  privateRow,
  row,
  staffRow,
  thread,
} from "../../tests/chat-fixtures.ts";
import {
  complaintSummary,
  isLowConfidence,
  quoteOf,
  requestSummary,
} from "./summary.ts";

const LINK = "https://app.test/t/acme/chat/c1";

/** A group the team writes in, then the client's `texts` from 09:00 on. */
const teamGroup = (...texts: string[]) =>
  thread([
    staffRow({ message_id: "hi", created_at: il("08:00") }),
    ...texts.map((text, index) =>
      row({
        message_id: `c${index + 1}`,
        created_at: il(`09:${String(index * 10).padStart(2, "0")}`),
        message_text: text,
      }),
    ),
  ]);

Deno.test("requestSummary", async (t) => {
  await t.step(
    "a group quotes the request, not the thanks after it, from the wait's start",
    () => {
      const wait = teamGroup("אפשר לעדכן את המבצע?", "תודה 🙏");
      assertEquals(
        requestSummary(wait, 5, null),
        'לקוח א: הלקוח כתב בקבוצה ב-27.10 בשעה 09:00: "אפשר לעדכן את המבצע?" ועדיין לא קיבל מענה (5 שעות עסקיות)',
      );
    },
  );

  await t.step(
    "a private group carries the time and a link, never the text",
    () => {
      const hidden = thread([privateRow({ message_text: "סוד פרטי?" })]);
      assertEquals(
        requestSummary(hidden, 1, LINK),
        `לקוח א: הלקוח כתב בקבוצה ב-27.10 בשעה 09:00 ועדיין לא קיבל מענה (שעה עסקית) – לצ׳אט: ${LINK}`,
      );
    },
  );
});

Deno.test("complaintSummary", async (t) => {
  await t.step("quotes the complaint line with its time", () => {
    const wait = teamGroup("שלום", "אני לא מרוצה מהלידים");
    assertEquals(
      complaintSummary(wait, wait.pending, null),
      'לקוח א: נראה שהלקוח מתלונן בקבוצה ב-27.10 בשעה 09:10: "אני לא מרוצה מהלידים"',
    );
  });
});

Deno.test("quoteOf", async (t) => {
  await t.step("only a group open to the team is quoted", () => {
    const privateGroup = thread([row({ message_text: "מתי?" })]);
    assertEquals(quoteOf(privateGroup, privateGroup.pending, "request"), null);
    const open = teamGroup("מתי   זה\nמגיע?");
    assertEquals(quoteOf(open, open.pending, "request"), "מתי זה מגיע?");
  });
});

Deno.test("isLowConfidence", async (t) => {
  await t.step("true only when every writer is an unmapped @lid", () => {
    const unsure = { sender_match_key: null, sender_lid_unmapped: true };
    assertEquals(isLowConfidence(thread([row(unsure)]).pending), true);
    assertEquals(
      isLowConfidence(
        thread([row(unsure), row({ created_at: il("09:05") })]).pending,
      ),
      false,
    );
  });
});
