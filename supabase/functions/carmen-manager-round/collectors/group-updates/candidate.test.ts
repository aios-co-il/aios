import { assert, assertEquals } from "jsr:@std/assert@1";
import { cardDraftOf } from "../../../_shared/manager-round/card-draft.ts";
import { CLIENT, GROUP, window } from "./group-fixtures.ts";
import { draftCandidate } from "./candidate.ts";
import { clamp } from "./clamp.ts";
import { markerDigest } from "./fallback.ts";

const w = window([
  { id: "m1", text: "מאשר תקציב 5000", at: "2026-11-01T10:00:00Z" },
  { id: "m2", text: "👍", substantive: false, at: "2026-11-01T10:01:00Z" },
  { id: "m3", text: "צריך באנר חדש", at: "2026-11-01T11:00:00Z" },
  { id: "m4", text: "בטיפול", speaker: "staff", at: "2026-11-01T12:00:00Z" },
]);
const candidate = draftCandidate({
  window: w,
  digest: {
    material: true,
    update_text: "אישר תקציב ₪5,000; ביקש באנר חדש",
    items: [
      { type: "budget_change", text: "אישר תקציב ₪5,000" },
      { type: "request", text: "ביקש באנר חדש" },
    ],
  },
  by: "model",
  modelMaterial: true,
  dropped: 0,
  contact: null,
});

Deno.test("draftCandidate", async (t) => {
  await t.step(
    "one finding per window, dated at its first counted message",
    () => {
      assertEquals(candidate.kind, "card_stale_group");
      assertEquals(
        candidate.fingerprint,
        `client:${CLIENT}:group:${GROUP}:from:m1`,
      );
      assertEquals(candidate.source_event_at, "2026-11-01T10:00:00Z");
      assertEquals([candidate.client_id, candidate.severity], [CLIENT, "info"]);
    },
  );

  await t.step("holds the drafted entry an approval writes", () => {
    assertEquals(cardDraftOf(candidate.evidence), {
      source: "group_digest",
      update_type: "group_summary",
      source_ref: `${GROUP}:m4`,
      content: "[כרמן · סיכום קבוצה] אישר תקציב ₪5,000; ביקש באנר חדש",
    });
  });

  await t.step("names the client in one line and says how to approve", () => {
    assert(candidate.summary_he.startsWith("פיצה רומא: "));
    assert(candidate.summary_he.includes('"אשר"'));
    assert(candidate.summary_he.length <= 500);
  });

  await t.step(
    "hands request and complaint items to the chat collector only",
    () => {
      assertEquals(candidate.evidence.chat_handoff, [
        { type: "request", text: "ביקש באנר חדש" },
      ]);
      assertEquals(candidate.evidence.window, {
        from: "2026-11-01T10:00:00Z",
        to: "2026-11-01T12:00:00Z",
        first_message_id: "m1",
        last_message_id: "m4",
        messages: 4,
        substantive: 3,
        client_messages: 2,
        staff_messages: 1,
        unknown_messages: 0,
      });
    },
  );

  await t.step(
    "a reported call rides along, owned by the staff member who wrote it",
    () => {
      const called = window([
        { id: "c1", text: "מאשר תקציב 5000" },
        {
          id: "c2",
          text: "דיברנו בטלפון, הכל סגור",
          speaker: "staff",
          staffUserId: "u-staff",
        },
      ]);
      const digested = {
        window: called,
        digest: { material: true, update_text: "אישר תקציב", items: [] },
        by: "model" as const,
        modelMaterial: true,
        dropped: 0,
      };
      const byStaff = draftCandidate({
        ...digested,
        contact: {
          kind: "call",
          message: called.messages[1],
          text: "שיחת טלפון עם הלקוח",
        },
      });
      assertEquals(cardDraftOf(byStaff.evidence)?.contact, {
        update_type: "call",
        source_ref: `group_contact:${GROUP}:c2`,
        content: "[כרמן · מקבוצת הוואטסאפ] שיחת טלפון עם הלקוח",
        participant_user_id: "u-staff",
        reported_at: called.messages[1].at,
      });
      assert(byStaff.summary_he.includes("כקשר עם הלקוח"));
      const byClient = draftCandidate({
        ...digested,
        contact: { kind: "meeting", message: called.messages[0], text: "x" },
      });
      assertEquals(
        cardDraftOf(byClient.evidence)?.contact?.participant_user_id,
        null,
      );
    },
  );

  await t.step("carries no phone and no message text", () => {
    const text = JSON.stringify(candidate);
    assert(!text.includes("521111111"));
    assert(!text.includes("צריך באנר חדש"));
  });

  await t.step(
    "the markers' quotes: phones masked, at most a group quote's limit",
    () => {
      const said = `מאשר את התקציב, תתקשרו 050-1234567 ${"פרטים ".repeat(30)}`;
      const quoted = window(
        Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, text: said })),
      );
      const digest = markerDigest(quoted);
      const marked = draftCandidate({
        window: quoted,
        digest,
        by: "markers",
        modelMaterial: null,
        dropped: 0,
        contact: null,
      });
      const text = JSON.stringify(marked);
      assert(!/050-?1234567|501234567/.test(text));
      assert(Array.from(digest.update_text).length > 200);
      assert(marked.summary_he.includes(clamp(digest.update_text, 200)));
      assert(!marked.summary_he.includes(digest.update_text));
    },
  );
});
