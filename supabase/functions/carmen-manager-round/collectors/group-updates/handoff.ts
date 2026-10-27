/**
 * Request and complaint items a group digest found. The chat collector
 * (AIO-252) owns unanswered_request and client_complaint and reads the same
 * group threads, so a digest never raises those kinds itself: one source per
 * finding. The items are kept on the draft (evidence.chat_handoff) for the
 * feed and the card.
 *
 * TODO(AIO-252): once the chat collector is in this branch, hand these to it
 * (seed its review of the group's last message) so a request the digest found
 * is checked for a staff reply without a second model call.
 */
import type { DigestItem } from "./digest.ts";

export const CHAT_HANDOFF_TYPES = ["request", "complaint"] as const;

/** The items the chat collector should see. */
export function chatHandoff(items: DigestItem[]): DigestItem[] {
  return items.filter((item) =>
    CHAT_HANDOFF_TYPES.some((type) => type === item.type),
  );
}
