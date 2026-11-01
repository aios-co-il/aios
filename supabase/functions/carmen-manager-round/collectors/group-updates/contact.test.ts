import { assertEquals } from "jsr:@std/assert@1";
import {
  type ContactClaim,
  contactTense,
  parseContactClaim,
  pastContact,
  withContact,
} from "./contact.ts";
import { window } from "./group-fixtures.ts";

const chat = window([
  { id: "m1", text: "מאשר את הבאנר" },
  {
    id: "m2",
    text: "דיברנו בטלפון עם הלקוח, הוא מאשר תקציב",
    speaker: "staff",
  },
  { id: "m3", text: "בהמשך לפגישתנו, מצרף את ההצעה" },
]);

/** The model's claim about `line`; held unless said otherwise. */
const claim = (fields: Partial<ContactClaim> = {}): ContactClaim => ({
  line: 2,
  kind: "call",
  tense: "past",
  text: "שיחת טלפון עם הלקוח על התקציב",
  ...fields,
});

/** The kind and message id of the contact found, or null. */
const found = (w = chat, c: ContactClaim | null = claim()) => {
  const contact = pastContact(w, c);
  return contact ? [contact.kind, contact.message.id, contact.text] : null;
};

Deno.test("pastContact", async (t) => {
  await t.step("a held call the model names counts, in its words", () => {
    assertEquals(found(), ["call", "m2", "שיחת טלפון עם הלקוח על התקציב"]);
  });

  await t.step("a held meeting counts", () => {
    assertEquals(
      found(chat, claim({ line: 3, kind: "meeting" }))?.[0],
      "meeting",
    );
  });

  await t.step("without a model claim the markers find the newest", () => {
    assertEquals(found(chat, null), [
      "meeting",
      "m3",
      'הודעה בקבוצה: "בהמשך לפגישתנו, מצרף את ההצעה"',
    ]);
  });

  await t.step("a planned call or meeting never counts", () => {
    const planned = window([
      { text: "נדבר מחר בטלפון" },
      { text: "נקבע פגישה לשבוע הבא" },
    ]);
    assertEquals(found(planned, claim({ line: 1, tense: "planned" })), null);
    // The message's own words overrule a model that calls it held.
    assertEquals(found(planned, claim({ line: 1 })), null);
    assertEquals(found(planned, claim({ line: 2, kind: "meeting" })), null);
    assertEquals(found(planned, null), null);
  });

  await t.step("a question about a call or meeting never counts", () => {
    const asked = window([
      { text: "דיברתם בטלפון?" },
      { text: "דיברנו בטלפון?" },
    ]);
    assertEquals(found(asked, claim({ line: 1, tense: "question" })), null);
    assertEquals(found(asked, claim({ line: 1 })), null);
    assertEquals(found(asked, claim({ line: 2 })), null);
    assertEquals(found(asked, null), null);
  });

  await t.step(
    "an unknown sender or a line outside the window never counts",
    () => {
      const unknown = window([
        { text: "דיברנו בטלפון", speaker: "unknown", key: null },
      ]);
      assertEquals(found(unknown, claim({ line: 1 })), null);
      assertEquals(found(unknown, null), null);
      const quiet = window([{ text: "מאשר" }]);
      assertEquals(found(quiet, claim({ line: 7 })), null);
    },
  );
});

Deno.test("contactTense", async (t) => {
  await t.step("reads the clause that names the contact", () => {
    assertEquals(
      [
        contactTense("בהמשך לשיחתנו בטלפון, מתי עולים?"),
        contactTense("שוחחנו אתמול, נדבר שוב מחר"),
        contactTense("דיברנו בטלפון?"),
        contactTense("אתקשר אליך מחר"),
        contactTense("הייתה פגישה?"),
        contactTense("מאשר את הבאנר"),
      ],
      ["past", "past", "question", "planned", "question", null],
    );
  });
});

Deno.test("parseContactClaim", async (t) => {
  await t.step("keeps a call or meeting with a known tense and line", () => {
    assertEquals(
      parseContactClaim({ line: 2, kind: "meeting", tense: "past", text: "x" }),
      { line: 2, kind: "meeting", tense: "past", text: "x" },
    );
  });

  await t.step("refuses any other kind, tense or line", () => {
    for (const raw of [
      { line: 2, kind: "note", tense: "past" },
      { line: 2, kind: "call", tense: "soon" },
      { line: 1.5, kind: "call", tense: "past" },
      null,
      undefined,
    ]) {
      assertEquals(parseContactClaim(raw), null);
    }
  });
});

Deno.test("withContact", async (t) => {
  const quiet = { material: false, update_text: "", items: [] };

  await t.step("a held contact alone makes the digest material", () => {
    const contact = pastContact(chat, claim());
    assertEquals(withContact(quiet, contact), {
      material: true,
      update_text: "שיחת טלפון עם הלקוח על התקציב",
      items: [],
    });
  });

  await t.step("otherwise the digest stays as it was", () => {
    const material = { material: true, update_text: "אישר", items: [] };
    assertEquals(withContact(material, pastContact(chat, claim())), material);
    assertEquals(withContact(quiet, null), quiet);
  });
});
