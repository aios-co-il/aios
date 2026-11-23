import { isGroupChatId } from "../carmen-session-identity.ts";
import { normalizeNotifyPhone, phonesMatch } from "./phone.ts";
import type {
  NotifyBridgeSession,
  NotifySessionCandidate,
  ResolveCarmenNotifyTargetResult,
} from "./types.ts";

/** Match a private session without following a group speaker's phone. */
export function findSessionForPhone(
  sessions: Array<NotifySessionCandidate>,
  phone: string,
): NotifySessionCandidate | null {
  // Group rows store the last speaker's phone (David chatting in AfterLead-DMM).
  // Matching on phone alone would steal private pulse/notify into that group.
  return (
    sessions.find((s) => {
      if (isGroupChatId(s.chat_id)) {
        return false;
      }
      return phonesMatch(s.chat_id, phone) || phonesMatch(s.phone, phone);
    }) ?? null
  );
}

/**
 * Pick the 1:1 chat to send a notify/pulse to.
 * Group sessions may still supply automation wiring, but the destination is
 * always the private phone — never the freshest @g.us row.
 */
export function pickNotifyDelivery(
  sessions: Array<NotifyBridgeSession>,
  target: Pick<ResolveCarmenNotifyTargetResult, "chatId" | "phone">,
): {
  chatId: string;
  phoneNumber: string;
  isGroup: false;
  matchedSession: NotifyBridgeSession | null;
  bridgeSession: NotifyBridgeSession | null;
} {
  const phone = normalizeNotifyPhone(target.phone) || "";
  const matchedSession =
    (findSessionForPhone(sessions, phone) as NotifyBridgeSession | null) ??
    null;
  const bridgeSession =
    (matchedSession?.automation_id ? matchedSession : null) ||
    sessions.find((s) => !!s.automation_id) ||
    null;
  const fromTarget = isGroupChatId(target.chatId)
    ? phone
    : target.chatId || phone;
  const chatId = matchedSession?.chat_id || fromTarget;
  return {
    chatId: isGroupChatId(chatId) ? phone : chatId,
    phoneNumber: normalizeNotifyPhone(matchedSession?.phone) || phone,
    isGroup: false,
    matchedSession,
    bridgeSession,
  };
}
