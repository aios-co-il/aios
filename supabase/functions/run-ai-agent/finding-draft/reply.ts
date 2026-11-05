/**
 * The message a finding-draft tool answers, in the person's own words: the
 * "תעדי <code>" of confirm_finding_draft, the "אשר <code>" (and any
 * "בלי שיחה") of approve_card_draft, and whether they wrote it in a WhatsApp
 * group, where Carmen's answer (with the drafted entry) would reach the
 * client. isGroupChat is the one group rule run-ai-agent reads.
 */
import { isGroupChatId } from "../../_shared/carmen-session-identity.ts";
import {
  parseApproveDraftReply,
  parseSkipContactReply,
} from "../../_shared/manager-round/card-draft.ts";
import { parseConfirmDraftReply } from "../../_shared/manager-round/contact-draft.ts";

export type FindingDraftReply = {
  /** The "תעדי <code>" code; null when the message has none. */
  shortCode: number | null;
  /** The "אשר <code>" code; null when the message has none. */
  approveCode: number | null;
  /** The person wrote "בלי שיחה" or "בלי פגישה". */
  skipContact: boolean;
  inGroup: boolean;
};

/** The reply a run answers, from its command text and wa_notify. */
export function findingDraftReplyOf(
  commandText: unknown,
  waNotify: unknown,
): FindingDraftReply {
  const text = typeof commandText === "string" ? commandText : "";
  return {
    shortCode: text ? parseConfirmDraftReply(text) : null,
    approveCode: text ? parseApproveDraftReply(text) : null,
    skipContact: !!text && parseSkipContactReply(text),
    inGroup: isGroupChat(waNotify),
  };
}

/** wa_notify of a group chat (client-visible): is_group, or a group chat id. */
export function isGroupChat(waNotify: unknown): boolean {
  if (!waNotify || typeof waNotify !== "object") {
    return false;
  }
  const chatId = "chat_id" in waNotify ? waNotify.chat_id : null;
  const isGroup = "is_group" in waNotify ? waNotify.is_group : null;
  return (
    isGroup === true || (typeof chatId === "string" && isGroupChatId(chatId))
  );
}
