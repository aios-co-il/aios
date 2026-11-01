import { assertEquals } from "jsr:@std/assert@1";
import {
  type ContactClaim,
  contactRefusal,
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

/** The contact found (kind, message id, card text), or null; `model` null: the model could not answer. */
const found = (
  w = chat,
  model: { claim: ContactClaim | null } | null = { claim: claim() },
) => {
  const contact = pastContact(w, model);
  return contact ? [contact.kind, contact.message.id, contact.text] : null;
};

/** A one-message window from the client. */
const said = (text: string) => window([{ text }]);

Deno.test("pastContact", async (t) => {
  await t.step("a held call the model names counts, in its words", () => {
    assertEquals(found(), ["call", "m2", "שיחת טלפון עם הלקוח על התקציב"]);
  });

  await t.step("a held meeting the model names counts", () => {
    const meeting = { claim: claim({ line: 3, kind: "meeting" }) };
    assertEquals(found(chat, meeting)?.[0], "meeting");
  });

  await t.step(
    "only when the model could not answer do the markers look",
    () => {
      assertEquals(found(chat, null), [
        "meeting",
        "m3",
        'הלקוח: "בהמשך לפגישתנו, מצרף את ההצעה"',
      ]);
    },
  );

  await t.step(
    "the model's planned, question or none is never overruled",
    () => {
      for (const model of [
        { claim: null },
        { claim: claim({ tense: "planned" }) },
        { claim: claim({ tense: "question" }) },
        { claim: claim({ line: 9 }) },
      ]) {
        assertEquals(found(chat, model), null);
      }
    },
  );

  await t.step("a planned meeting the model calls planned is none", () => {
    const planned = said("ניפגש מחר ואשלח סיכום פגישה");
    const model = {
      claim: claim({ line: 1, kind: "meeting", tense: "planned" }),
    };
    assertEquals(found(planned, model), null);
    assertEquals(found(planned, null), null);
  });

  await t.step("the words refuse a negation, a plan or a question", () => {
    for (const text of [
      "עוד לא דיברנו בטלפון, אפשר מחר?",
      "לא נפגשנו מאז החודש שעבר",
      "נדבר מחר בטלפון",
      "דיברנו בטלפון?",
    ]) {
      // Neither a model that calls it held nor the markers take it.
      assertEquals(
        found(said(text), { claim: claim({ line: 1 }) }),
        null,
        text,
      );
      assertEquals(found(said(text), null), null, text);
    }
  });

  await t.step("a talk with someone else or in the group is no contact", () => {
    for (const text of [
      "שוחחנו עם הספק",
      "דיברנו בטלפון עם הספק",
      "כפי ששוחחנו כאן בקבוצה",
    ]) {
      assertEquals(
        found(said(text), { claim: claim({ line: 1 }) }),
        null,
        text,
      );
      assertEquals(found(said(text), null), null, text);
    }
  });

  await t.step("an unknown sender never counts", () => {
    const unknown = window([
      { text: "דיברנו בטלפון", speaker: "unknown", key: null },
    ]);
    assertEquals(found(unknown, { claim: claim({ line: 1 }) }), null);
    assertEquals(found(unknown, null), null);
  });
});

Deno.test("contactRefusal", async (t) => {
  await t.step("reads the clause that names the contact", () => {
    assertEquals(
      [
        contactRefusal("בהמשך לשיחתנו בטלפון, מתי עולים?"),
        contactRefusal("עוד לא דיברנו בטלפון, אפשר מחר?"),
        contactRefusal("לא נפגשנו מאז החודש שעבר"),
        contactRefusal("ניפגש מחר ואשלח סיכום פגישה"),
        contactRefusal("שוחחנו עם הספק"),
        contactRefusal("כפי ששוחחנו כאן בקבוצה"),
        contactRefusal("דיברנו בטלפון עם הלקוח"),
        contactRefusal("הייתה פגישה?"),
      ],
      [
        null,
        "negated",
        "negated",
        "planned",
        "not_client",
        "in_group",
        null,
        "question",
      ],
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
      "call",
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
    const contact = pastContact(chat, { claim: claim() });
    assertEquals(withContact(quiet, contact), {
      material: true,
      update_text: "שיחת טלפון עם הלקוח על התקציב",
      items: [],
    });
  });

  await t.step("otherwise the digest stays as it was", () => {
    const material = { material: true, update_text: "אישר", items: [] };
    const contact = pastContact(chat, { claim: claim() });
    assertEquals(withContact(material, contact), material);
    assertEquals(withContact(quiet, null), quiet);
  });
});
