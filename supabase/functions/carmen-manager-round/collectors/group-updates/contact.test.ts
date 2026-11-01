import { assertEquals } from "jsr:@std/assert@1";
import {
  type ContactClaim,
  contactRefusal,
  parseContactClaim,
  pastContact,
  withContact,
} from "./contact.ts";
import {
  history,
  message,
  STAFF_KEY,
  TENANT,
  window,
} from "./group-fixtures.ts";
import { groupWindows } from "./windows.ts";

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

/** The contact found (kind, message id, card text), or null. */
const found = (w = chat, c: ContactClaim | null = claim()) => {
  const contact = pastContact(w, c);
  return contact ? [contact.kind, contact.message.id, contact.text] : null;
};

/** A one-message window from the client. */
const said = (text: string) => window([{ text }]);

// The reviewers' phrases: none may become a contact without the model, and
// those the words refuse not even with a model that calls them held.
const REFUSED = [
  "ניפגש מחר ואשלח סיכום פגישה",
  "עוד לא דיברנו בטלפון, אפשר מחר?",
  "לא נפגשנו מאז החודש שעבר",
  "שוחחנו עם הספק",
  "כפי ששוחחנו כאן בקבוצה",
];
const NO_MARKERS = [
  "דיברנו בטלפון או לא",
  "דיברנו בטלפון ולא.",
  "אם דיברנו בטלפון אז זה סגור",
  "מתי נפגשנו בפעם האחרונה",
  "בהמשך לפגישה שלנו ביום ראשון הקרוב",
  "סיכום הפגישה הפנימית של הצוות",
  "דיברנו בטלפון, זה לא נכון",
];

Deno.test("pastContact", async (t) => {
  await t.step("a held call the model names counts, in its words", () => {
    assertEquals(found(), ["call", "m2", "שיחת טלפון עם הלקוח על התקציב"]);
  });

  await t.step("a held meeting the model names counts", () => {
    assertEquals(
      found(chat, claim({ line: 3, kind: "meeting" }))?.[0],
      "meeting",
    );
  });

  await t.step("with the model down there is no contact at all", () => {
    assertEquals(found(chat, null), null);
    for (const text of [...REFUSED, ...NO_MARKERS]) {
      assertEquals(found(said(text), null), null, text);
    }
  });

  await t.step(
    "the model's planned, question or out-of-window line is none",
    () => {
      for (const c of [
        claim({ tense: "planned" }),
        claim({ tense: "question" }),
        claim({ line: 9 }),
      ]) {
        assertEquals(found(chat, c), null);
      }
    },
  );

  await t.step("the words overrule a model that calls them held", () => {
    for (const text of [...REFUSED, "נדבר מחר בטלפון", "דיברנו בטלפון?"]) {
      assertEquals(found(said(text), claim({ line: 1 })), null, text);
    }
  });

  await t.step("a message no person typed is never a contact", () => {
    const unknown = window([
      { text: "דיברנו בטלפון", speaker: "unknown", key: null },
    ]);
    assertEquals(found(unknown, claim({ line: 1 })), null);
    const staff = {
      keys: new Map([[STAFF_KEY, "u-staff"]]),
      keyTenants: new Map([[STAFF_KEY, new Set([TENANT])]]),
      tenantsOf: new Map([["u-staff", new Set([TENANT])]]),
    };
    const sent = (sendKind: string) =>
      groupWindows(
        [
          history([
            message("t1", "2026-11-01T09:00:00Z", "דיברנו בטלפון, מצורף הדוח", {
              out: true,
              sentBy: "u-staff",
              sendKind,
            }),
          ]),
        ],
        { floor: "", groups: {} },
        new Date("2026-11-01T00:00:00Z"),
        staff,
      )[0];
    // An automation template that says "דיברנו בטלפון" reports nothing.
    assertEquals(found(sent("automation"), claim({ line: 1 })), null);
    assertEquals(
      pastContact(sent("chat"), claim({ line: 1 }))?.message.staffUserId,
      "u-staff",
    );
  });
});

Deno.test("pastContact on the agency line's own phone", async (t) => {
  const staff = {
    keys: new Map<string, string | null>(),
    keyTenants: new Map<string, Set<string>>(),
    tenantsOf: new Map([["u-owner", new Set([TENANT])]]),
  };
  /** One outbound "בהמשך לפגישתנו" on the line of u-owner, typed on its phone or not. */
  const outbound = (typedOnPhone: boolean) =>
    groupWindows(
      [
        history([
          message("p1", "2026-11-01T09:00:00Z", "בהמשך לפגישתנו, מצרף הצעה", {
            out: true,
            typedOnPhone,
            lineUserId: "u-owner",
          }),
        ]),
      ],
      { floor: "", groups: {} },
      new Date("2026-11-01T00:00:00Z"),
      staff,
    )[0];
  const meeting = claim({ line: 1, kind: "meeting" });

  await t.step(
    "typed in WhatsApp on that phone: the line's user owns it",
    () => {
      assertEquals(
        pastContact(outbound(true), meeting)?.message.staffUserId,
        "u-owner",
      );
    },
  );

  await t.step("sent through the API with no person kind: never", () => {
    assertEquals(pastContact(outbound(false), meeting), null);
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
    assertEquals(withContact(quiet, pastContact(chat, claim())), {
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
