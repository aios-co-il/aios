/**
 * Which client lines of a thread the model has not read yet, whether they
 * are worth a call, and whether an earlier read still speaks for the open
 * wait. Every client streak with an unread line counts, not only the latest:
 * a complaint staff answered before the run, followed by a thank-you, is
 * still read.
 */
import { onlyAcknowledgements, onlyThanks, readMarkers } from "./markers.ts";
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

/** What a read looks for in one thread. */
export type ReadScope = {
  /** Complaints are read (client_complaint is on). */
  complaints: boolean;
  /** The thread's current wait already has an open unanswered_request. */
  waitOpen: boolean;
};

/**
 * True for a group open to the team with unread client lines that say more
 * than thanks, in a streak the complaint words did not already flag (when
 * complaints are read), or in the open wait when no request marker shows.
 * Otherwise the markers already say everything a verdict could add. An
 * unread receipt ('קיבלתי') is read too when the open wait it ends has a
 * line beyond acknowledgements, no request marker and no open finding: the
 * request a verdict found there may have been met outside the thread. Once
 * the finding is open no verdict can drop it, so the receipt is not read.
 */
export function needsModel(
  thread: Thread,
  unread: Turn[],
  scope: ReadScope,
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
    if (!texts.length) {
      return false;
    }
    const all = streak.turns.map((turn) => turn.text);
    const markers = readMarkers(all);
    const waiting = index === streaks.length - 1 && thread.pending.length > 0;
    if (onlyAcknowledgements(texts)) {
      return (
        waiting &&
        !scope.waitOpen &&
        !markers.request &&
        !onlyThanks(texts) &&
        !onlyAcknowledgements(all)
      );
    }
    return (
      (scope.complaints && !markers.complaint) || (waiting && !markers.request)
    );
  });
}

/**
 * True when the model's read, up to the client message `reviewedId`, still
 * speaks for the open wait: it read one of the wait's lines, and the client
 * wrote only thanks after it. needsModel never asks about thanks, so a
 * thank-you must not make the read stale either; a receipt ('קיבלתי') does,
 * and needsModel reads the wait again, unless the wait's finding is open
 * (`waitOpen`): the receipt is not read then, so the read that raised the
 * finding keeps speaking for it.
 */
export function readCoversWait(
  thread: Thread,
  reviewedId: string,
  waitOpen: boolean,
): boolean {
  const at = thread.pending.findIndex((turn) => turn.id === reviewedId);
  if (at < 0) {
    return false;
  }
  const later = thread.pending.slice(at + 1).map((turn) => turn.text);
  return waitOpen ? onlyAcknowledgements(later) : onlyThanks(later);
}
