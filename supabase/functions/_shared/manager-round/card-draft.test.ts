import { assertEquals } from "jsr:@std/assert@1";
import {
  type CardDraft,
  cardDraftContent,
  cardDraftEntry,
  cardDraftOf,
  parseApproveDraftReply,
} from "./card-draft.ts";

const draft: CardDraft = {
  source: "group_digest",
  update_type: "group_summary",
  source_ref: "g1:m9",
  content: "[כרמן · סיכום קבוצה] אישר תקציב ₪5,000",
};

Deno.test("cardDraftOf", async (t) => {
  await t.step("reads a well-formed draft", () => {
    assertEquals(cardDraftOf({ card_draft: draft, other: 1 }), draft);
  });

  await t.step(
    "refuses anything that could count as contact or is incomplete",
    () => {
      assertEquals(
        cardDraftOf({ card_draft: { ...draft, source: "carmen_confirmed" } }),
        null,
      );
      assertEquals(
        cardDraftOf({ card_draft: { ...draft, update_type: "call" } }),
        null,
      );
      assertEquals(
        cardDraftOf({ card_draft: { ...draft, source_ref: " " } }),
        null,
      );
      assertEquals(
        cardDraftOf({ draft: { update_type: "call", text_he: "x" } }),
        null,
      );
      assertEquals(cardDraftOf(null), null);
    },
  );
});

Deno.test("cardDraftEntry", async (t) => {
  await t.step(
    "a group digest the campaigner owns and that never counts as contact",
    () => {
      const entry = cardDraftEntry(
        "t1",
        { id: "f1", short_code: 12, client_id: "c1" },
        draft,
        "u-approver",
      );
      assertEquals(entry, {
        tenantId: "t1",
        clientId: "c1",
        content: draft.content,
        updateType: "group_summary",
        source: "group_digest",
        sourceRef: "g1:m9",
        attributedUserId: null,
        countsAsContact: false,
        metadata: {
          finding_id: "f1",
          short_code: 12,
          written_by: "approval",
          approved_by: "u-approver",
        },
      });
    },
  );

  await t.step("Carmen's own write names no approver", () => {
    const entry = cardDraftEntry(
      "t1",
      { id: "f1", short_code: 12, client_id: "c1" },
      draft,
      null,
    );
    assertEquals(entry.metadata, {
      finding_id: "f1",
      short_code: 12,
      written_by: "carmen",
      approved_by: null,
    });
  });
});

Deno.test("cardDraftContent", () => {
  assertEquals(
    cardDraftContent("group_digest", "  ביקש באנר חדש "),
    "[כרמן · סיכום קבוצה] ביקש באנר חדש",
  );
});

Deno.test("parseApproveDraftReply", async (t) => {
  await t.step("reads the code after the reply word", () => {
    assertEquals(parseApproveDraftReply("אשר 123"), 123);
    assertEquals(parseApproveDraftReply("אשרי #45"), 45);
    assertEquals(parseApproveDraftReply("טוב, אשרו 7 בבקשה"), 7);
  });

  await t.step("ignores other words and replies without a code", () => {
    assertEquals(parseApproveDraftReply("מאשר 123"), null);
    assertEquals(parseApproveDraftReply("לאשר 123"), null);
    assertEquals(parseApproveDraftReply("אשר"), null);
    assertEquals(parseApproveDraftReply("תעדי 12"), null);
  });
});
