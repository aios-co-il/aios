import { assertEquals } from "jsr:@std/assert@1";
import { buildRecordClientCardEntryArgs } from "../client-card/entry.ts";
import { clientCardSourceCanCountAsContact } from "../client-card/sources.ts";
import {
  cardContactEntry,
  type ContactDraft,
  contactDraftOf,
  contactSourceRef,
  draftNeedsPerson,
  isGroupContactRef,
} from "./card-contact.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const STAFF = "33333333-3333-4333-8333-333333333333";
const CAMPAIGNER = "44444444-4444-4444-8444-444444444444";
const APPROVER = "55555555-5555-4555-8555-555555555555";

const contact: ContactDraft = {
  update_type: "call",
  source_ref: contactSourceRef("120363000000000001@g.us", "BAE5F4886F6F2D05"),
  content: "[כרמן · מקבוצת הוואטסאפ] שיחת טלפון עם הלקוח על התקציב",
  participant_user_id: STAFF,
  reported_at: "2026-11-01T10:00:00Z",
};
const finding = { id: "f1", short_code: 12, client_id: CLIENT };
const approval = { approvedBy: APPROVER, fallbackUserId: CAMPAIGNER };

Deno.test("cardContactEntry", async (t) => {
  await t.step(
    "a confirmed contact entry the pulse counts, deduplicated on the message",
    () => {
      const entry = cardContactEntry(TENANT, finding, contact, approval);
      assertEquals(
        [
          entry.source,
          entry.updateType,
          entry.countsAsContact,
          entry.sourceRef,
        ],
        [
          "carmen_confirmed",
          "call",
          true,
          "group_contact:120363000000000001@g.us:BAE5F4886F6F2D05",
        ],
      );
      assertEquals(clientCardSourceCanCountAsContact(entry.source), true);
      const args = buildRecordClientCardEntryArgs(entry);
      assertEquals(
        [args.p_counts_as_contact, args.p_attributed_user],
        [true, STAFF],
      );
    },
  );

  await t.step("the staff member who wrote the message owns it", () => {
    const entry = cardContactEntry(TENANT, finding, contact, approval);
    assertEquals(entry.attributedUserId, STAFF);
    assertEquals(entry.metadata, {
      finding_id: "f1",
      short_code: 12,
      written_by: "approval",
      approved_by: APPROVER,
      attributed_to: "message_author",
      reported_at: "2026-11-01T10:00:00Z",
    });
  });

  await t.step(
    "a message naming nobody falls back to the client's campaigner",
    () => {
      const entry = cardContactEntry(
        TENANT,
        finding,
        { ...contact, participant_user_id: null },
        approval,
      );
      assertEquals(entry.attributedUserId, CAMPAIGNER);
      assertEquals(
        buildRecordClientCardEntryArgs(entry).p_attributed_user,
        CAMPAIGNER,
      );
    },
  );
});

Deno.test("contactDraftOf", async (t) => {
  await t.step("reads a well-formed call or meeting", () => {
    assertEquals(contactDraftOf(contact), contact);
    assertEquals(contactDraftOf({ ...contact, participant_user_id: null }), {
      ...contact,
      participant_user_id: null,
    });
  });

  await t.step("refuses any other type or a missing field", () => {
    assertEquals(contactDraftOf({ ...contact, update_type: "note" }), null);
    assertEquals(contactDraftOf({ ...contact, source_ref: " " }), null);
    assertEquals(contactDraftOf({ ...contact, reported_at: null }), null);
    assertEquals(contactDraftOf(undefined), null);
  });
});

Deno.test("draftNeedsPerson", () => {
  assertEquals(
    [draftNeedsPerson({ contact }), draftNeedsPerson({})],
    [true, false],
  );
});

Deno.test("isGroupContactRef", () => {
  assertEquals(
    [
      isGroupContactRef(contact.source_ref),
      isGroupContactRef("add_client_update:u1:2026-11-01T10:abc"),
      isGroupContactRef(null),
    ],
    [true, false, false],
  );
});
