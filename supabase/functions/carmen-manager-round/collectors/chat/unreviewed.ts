/**
 * Which client lines of a thread the model has not read yet, and whether
 * they are worth a call. Every client streak with an unread line counts, not
 * only the latest: a complaint staff answered before the run, followed by a
 * thank-you, is still read.
 */
import { onlyAcknowledgements, readMarkers } from "./markers.ts";
import { clientStreaks } from "./streaks.ts";
import type { Thread, Turn } from "./threads.ts";

/**
 * The client turns after `reviewedId`, the last client message the model
 * read (carmen_chat_thread_reviews). Every client turn when there is none, or
 * when it is not in the read: the read holds a thread's newest messages, so
 * a message missing from it is older than all of them.
 */
export function unreviewedTurns(
  thread: Thread,
  reviewedId: string | undefined,
): Turn[] {
  const at = reviewedId
    ? thread.turns.findIndex((turn) => turn.id === reviewedId)
    : -1;
  return thread.turns.slice(at + 1).filter((turn) => turn.by === "client");
}

/**
 * True for a group open to the team with unread client lines that say more
 * than thanks, in a streak the complaint words did not already flag (when
 * complaints are read), or in the open wait when no request marker shows.
 * Otherwise the markers already say everything a verdict could add.
 */
export function needsModel(
  thread: Thread,
  unread: Turn[],
  complaints: boolean,
): boolean {
  if (thread.kind !== "group" || !thread.openToTeam) {
    return false;
  }
  const unreadIds = new Set(unread.map((turn) => turn.id));
  const streaks = clientStreaks(thread);
  return streaks.some((streak, index) => {
    const texts = streak.turns
      .filter((turn) => unreadIds.has(turn.id))
      .map((turn) => turn.text);
    if (!texts.length || onlyAcknowledgements(texts)) {
      return false;
    }
    const markers = readMarkers(streak.turns.map((turn) => turn.text));
    const waiting = index === streaks.length - 1 && thread.pending.length > 0;
    return (complaints && !markers.complaint) || (waiting && !markers.request);
  });
}
