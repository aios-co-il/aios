/**
 * A call or meeting with the client that a message in the client's group
 * reports as already held (AIO-254), drafted beside the group summary
 * (evidence.card_draft.contact). It counts as client contact, and only a
 * person may vouch for contact (run-ai-agent/client-card-contact-policy.ts),
 * so it is written only when a staff member approves the draft
 * ("אשר <code>"), never by Carmen on her own. The approving person vouches;
 * the entry belongs to the staff member who wrote the message when the round
 * knows them, else to the author of the summary entry, which is the client's
 * campaigner (else the tenant owner) by record_client_card_entry's fallback.
 * Its source_ref prefix tells the group-update gate that no person typed it.
 *
 * Limitation: the pulse dates the contact when it is approved (created_at);
 * the message's own time is kept in metadata.reported_at.
 */
import type { ClientCardEntryInput } from "../client-card/entry-types.ts";
import {
  CONTACT_UPDATE_TYPES,
  type CarmenClientUpdateType,
  isCarmenClientUpdateType,
} from "../client-card/sources.ts";
import type { Json } from "../database.types.ts";
import type { DraftedFinding } from "./card-draft.ts";
import { jsonObject, trimmedText } from "../pulse/json.ts";

/** source_ref prefix of the contacts this flow writes. */
export const GROUP_CONTACT_REF_PREFIX = "group_contact:";

export type ContactDraft = {
  /** One of CONTACT_UPDATE_TYPES (call, meeting). */
  update_type: CarmenClientUpdateType;
  /** contactSourceRef(): the reporting message, so it is recorded once. */
  source_ref: string;
  content: string;
  /** The staff member of the client's tenant who wrote the message, when known. */
  participant_user_id: string | null;
  /** When the message was sent. */
  reported_at: string;
};

/** Who vouches for the contact, and whose it is when the message names nobody. */
export type ContactApproval = {
  approvedBy: string;
  /** The summary entry's author: the client's campaigner, else the tenant owner. */
  fallbackUserId: string;
};

/** True for a card update type that claims the client was contacted. */
export function isContactUpdateType(
  value: unknown,
): value is CarmenClientUpdateType {
  return (
    isCarmenClientUpdateType(value) && CONTACT_UPDATE_TYPES.includes(value)
  );
}

/** The Hebrew word for a contact type: "פגישה" for a meeting, else "שיחה". */
export function contactKindLabel(kind: CarmenClientUpdateType): string {
  return kind === "meeting" ? "פגישה" : "שיחה";
}

/**
 * The dedupe key of a contact reported by one group message: the WhatsApp
 * group chat and the provider's message id, the same for every tenant and
 * line that stored the message.
 */
export function contactSourceRef(
  groupChatId: string,
  providerMessageId: string,
): string {
  return `${GROUP_CONTACT_REF_PREFIX}${groupChatId}:${providerMessageId}`;
}

/**
 * True for an entry this flow wrote from a group message. It counts as
 * contact for the pulse, but it is not a person's card update, so the
 * group-update gate and the drafts still waiting ignore it.
 */
export function isGroupContactRef(sourceRef: string | null): boolean {
  return !!sourceRef?.startsWith(GROUP_CONTACT_REF_PREFIX);
}

/** The entry text: Carmen's prefix naming the group, then the description. */
export function contactContent(text: string): string {
  return `[כרמן · מקבוצת הוואטסאפ] ${text.trim()}`;
}

/** card_draft.contact when it is well formed, else null. */
export function contactDraftOf(raw: Json | undefined): ContactDraft | null {
  const contact = jsonObject(raw);
  const [type, ref, content, at] = [
    contact?.update_type,
    trimmedText(contact?.source_ref),
    trimmedText(contact?.content),
    trimmedText(contact?.reported_at),
  ];
  const participant = trimmedText(contact?.participant_user_id);
  return isContactUpdateType(type) && ref && content && at
    ? {
        update_type: type,
        source_ref: ref,
        content,
        participant_user_id: participant,
        reported_at: at,
      }
    : null;
}

/** True when the draft holds a reported contact, so only a person may write it. */
export function draftNeedsPerson(draft: { contact?: ContactDraft }): boolean {
  return !!draft.contact;
}

/**
 * The contact entry: carmen_confirmed and counted as contact, like a call a
 * person asks Carmen to log, attributed to the participant or the fallback,
 * and deduplicated on the reporting message.
 */
export function cardContactEntry(
  tenantId: string,
  finding: DraftedFinding,
  contact: ContactDraft,
  approval: ContactApproval,
): ClientCardEntryInput {
  return {
    tenantId,
    clientId: finding.client_id,
    content: contact.content,
    updateType: contact.update_type,
    source: "carmen_confirmed",
    sourceRef: contact.source_ref,
    attributedUserId: contact.participant_user_id ?? approval.fallbackUserId,
    countsAsContact: true,
    metadata: {
      finding_id: finding.id,
      short_code: finding.short_code,
      written_by: "approval",
      approved_by: approval.approvedBy,
      attributed_to: contact.participant_user_id
        ? "message_author"
        : "summary_author",
      reported_at: contact.reported_at,
    },
  };
}
