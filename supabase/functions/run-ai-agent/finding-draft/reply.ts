/**
 * The message a confirm_finding_draft call answers: the "תעדי <code>" in the
 * person's own words, and whether they wrote it in a WhatsApp group, where
 * Carmen's answer (with the drafted entry) would reach the client.
 */
import { parseConfirmDraftReply } from "../../_shared/manager-round/contact-draft.ts";

export type FindingDraftReply = {
  /** The code in the person's message; null when it is not such a reply. */
  shortCode: number | null;
  inGroup: boolean;
};

/** The reply a run answers, from its command text and wa_notify. */
export function findingDraftReplyOf(
  commandText: unknown,
  waNotify: unknown,
): FindingDraftReply {
  return {
    shortCode:
      typeof commandText === "string"
        ? parseConfirmDraftReply(commandText)
        : null,
    inGroup: isGroupChat(waNotify),
  };
}

/** wa_notify of a group chat: is_group, or a chat id ending in @g.us. */
function isGroupChat(waNotify: unknown): boolean {
  if (!waNotify || typeof waNotify !== "object") {
    return false;
  }
  const chatId = "chat_id" in waNotify ? waNotify.chat_id : null;
  const isGroup = "is_group" in waNotify ? waNotify.is_group : null;
  return (
    isGroup === true || (typeof chatId === "string" && /@g\.us/i.test(chatId))
  );
}
