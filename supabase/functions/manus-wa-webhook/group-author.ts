import {
  digitsOnly,
  looksLikeRealPhone,
} from "../_shared/carmen-private-routing.ts";

/**
 * True when Manus did not give us a usable participant phone for identity checks,
 * so the webhook waits for Green API's copy of the same message to pair the sender.
 * A long WhatsApp LID whose last nine digits look like an Israeli mobile is still
 * unresolved: only `looksLikeRealPhone` (length and shape) makes it a phone.
 */
export function isUnresolvedGroupAuthor(
  authorPhone: string,
  groupChatId: string,
): boolean {
  if (!authorPhone) {
    return true;
  }
  if (authorPhone === digitsOnly(groupChatId.split("@")[0])) {
    return true;
  }
  return !looksLikeRealPhone(authorPhone);
}
