/**
 * A material group digest as a card_stale_group finding: one Hebrew line for
 * staff (sent as is), and the drafted card entry an approval writes
 * (evidence.card_draft, source group_digest, source_ref
 * '<group_id>:<last_message_id>'). Message ids, counts and the digest's items
 * only; no phone, and no raw message beyond the markers' quotes, of which
 * the staff line carries at most MAX_ITEM_CHARS (a group quote's limit). The
 * fingerprint names the window's first message, so a window digested again
 * after a lost watermark updates its finding instead of adding one.
 */
import {
  APPROVE_DRAFT_WORD_HE,
  cardDraftContent,
  type CardDraft,
} from "../../../_shared/manager-round/card-draft.ts";
import type { FindingCandidate } from "../types.ts";
import { clamp } from "./clamp.ts";
import { MAX_ITEM_CHARS } from "./digest.ts";
import { chatHandoff } from "./handoff.ts";
import type { WindowDigest } from "./summarize.ts";
import { substantive } from "./windows.ts";

/** The finding for one material digest. */
export function draftCandidate(digested: WindowDigest): FindingCandidate {
  const { window, digest } = digested;
  const counted = substantive(window);
  const first = counted[0] ?? window.messages[0];
  const opening = window.messages[0]?.id ?? window.last.id;
  const draft: CardDraft = {
    source: "group_digest",
    update_type: "group_summary",
    source_ref: `${window.groupId}:${window.last.id}`,
    content: cardDraftContent("group_digest", digest.update_text),
  };
  return {
    kind: "card_stale_group",
    fingerprint: `client:${window.clientId}:group:${window.groupId}:from:${opening}`,
    severity: "info",
    client_id: window.clientId,
    agency_id: null,
    source_event_at: first.at,
    summary_he: clamp(
      `${window.clientName}: עדכון מקבוצת הוואטסאפ שעוד לא נרשם בכרטיס – ${clamp(digest.update_text, MAX_ITEM_CHARS)}. לרישום בכרטיס: "${APPROVE_DRAFT_WORD_HE}" ומספר הפריט`,
      500,
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
      items: digest.items,
      chat_handoff: chatHandoff(digest.items),
      digested_by: digested.by,
      model_material: digested.modelMaterial,
      dropped_items: digested.dropped,
    },
    owner_user_id: null,
  };
}
