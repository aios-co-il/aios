/**
 * Whether a run is a WhatsApp group session (client-visible), from its
 * WhatsApp context: the group flag or a group chat id.
 */
import { isGroupChatId } from "../_shared/carmen-session-identity.ts";

/** True for a WhatsApp group session; false for a private chat or no WhatsApp context. */
export function isGroupSession(waNotify: unknown): boolean {
  if (!waNotify || typeof waNotify !== "object") {
    return false;
  }
  const flagged = "is_group" in waNotify && waNotify.is_group === true;
  const chatId = "chat_id" in waNotify ? waNotify.chat_id : null;
  return flagged || (typeof chatId === "string" && isGroupChatId(chatId));
}
