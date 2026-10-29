/**
 * A material group digest as a card_stale_group finding: one Hebrew line for
 * staff (sent as is), and the drafted card entry an approval writes
 * (evidence.card_draft, source group_digest, source_ref
 * '<group_id>:<last_message_id>'). Message ids, counts and the digest's items
 * only; no phone, and no raw message beyond the markers' quotes, of which
 * the staff line carries at most MAX_ITEM_CHARS (a group quote's limit). The
 * fingerprint names the window's first message, so a window digested again
 * after a lost watermark updates its finding instead of adding one. A call
 * or meeting the group reports as held rides along as card_draft.contact
 * (source_ref 'group_contact:<group_chat_id>:<provider message id>'), and
 * the staff line quotes the message taken for it (CONTACT_QUOTE_CHARS).
 */
import {
  contactContent,
  type ContactDraft,
  contactKindLabel,
  contactSourceRef,
} from "../../../_shared/manager-round/card-contact.ts";
import {
  APPROVE_DRAFT_WORD_HE,
  cardDraftContent,
  type CardDraft,
} from "../../../_shared/manager-round/card-draft.ts";
import { SUMMARY_MAX } from "../chat/summary.ts";
import type { FindingCandidate } from "../types.ts";
import { clamp } from "./clamp.ts";
import { type PastContact, quoted } from "./contact.ts";
import { MAX_ITEM_CHARS } from "./digest.ts";
import { chatHandoff } from "./handoff.ts";
import type { WindowDigest } from "./summarize.ts";
import { substantive } from "./windows.ts";

const CONTACT_QUOTE_CHARS = 80;

/** The finding for one material digest. */
export function draftCandidate(digested: WindowDigest): FindingCandidate {
  const { window, digest, contact } = digested;
  const counted = substantive(window);
  const first = counted[0] ?? window.messages[0];
  const opening = window.messages[0]?.id ?? window.last.id;
  const draft: CardDraft = {
    source: "group_digest",
    update_type: "group_summary",
    source_ref: `${window.groupId}:${window.last.id}`,
    content: cardDraftContent("group_digest", digest.update_text),
    ...(contact ? { contact: contactDraft(window.groupChatId, contact) } : {}),
  };
  return {
    kind: "card_stale_group",
    fingerprint: `client:${window.clientId}:group:${window.groupId}:from:${opening}`,
    severity: "info",
    client_id: window.clientId,
    agency_id: null,
    source_event_at: first.at,
    summary_he: clamp(
      `${window.clientName}: עדכון מקבוצת הוואטסאפ שעוד לא נרשם בכרטיס – ${clamp(digest.update_text, MAX_ITEM_CHARS)}.${contact ? contactNote(contact) : ""} לרישום בכרטיס: "${APPROVE_DRAFT_WORD_HE}" ומספר הפריט`,
      SUMMARY_MAX,
    ),
    evidence: {
      group_id: window.groupId,
      group_name: window.groupName,
      window: {
        from: first.at,
        to: window.last.at,
        first_message_id: first.id,
        last_message_id: window.last.id,
        messages: window.messages.length,
        substantive: counted.length,
        client_messages: counted.filter((m) => m.speaker === "client").length,
        staff_messages: counted.filter((m) => m.speaker === "staff").length,
        unknown_messages: counted.filter((m) => m.speaker === "unknown").length,
      },
      card_draft: draft,
      contact: contact
        ? {
            kind: contact.kind,
            message_id: contact.message.id,
            speaker: contact.message.speaker,
          }
        : null,
      items: digest.items,
      chat_handoff: chatHandoff(digest.items),
      digested_by: digested.by,
      model_material: digested.modelMaterial,
      dropped_items: digested.dropped,
    },
    owner_user_id: null,
  };
}

/**
 * The staff line names the message taken as the contact, so the approver
 * sees a wrong pick before "אשר".
 */
function contactNote(contact: PastContact): string {
  return ` לפי ההודעה ${quoted(contact.message, CONTACT_QUOTE_CHARS)} הייתה ${contactKindLabel(contact.kind)} עם הלקוח; האישור ירשום אותה כקשר עם הלקוח.`;
}

/**
 * The reported contact's entry: the message's staff author when known (a
 * client's message names nobody), else the summary's author on approval.
 */
function contactDraft(groupChatId: string, contact: PastContact): ContactDraft {
  const { message } = contact;
  return {
    update_type: contact.kind,
    source_ref: contactSourceRef(groupChatId, message.providerId),
    content: contactContent(contact.text),
    participant_user_id:
      message.speaker === "staff" ? message.staffUserId : null,
    reported_at: message.at,
  };
}
