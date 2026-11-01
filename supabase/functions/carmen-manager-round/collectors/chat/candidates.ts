/**
 * unanswered_request findings from the reviewed waits: the wait is past the
 * SLA and reads as a request (markers, or a confident LLM verdict that can
 * only add), or its finding is already open (it stays reported while the
 * client waits, so a changed verdict never drops it). Direct-chat and
 * private-group text is never put in a summary or in the evidence campaigners
 * can read.
 */
import type { FindingCandidate } from "../types.ts";
import type { ThreadReview } from "./gate.ts";
import { isLowConfidence, quoteOf, requestSummary } from "./summary.ts";
import type { Thread } from "./threads.ts";
import type { Verdicts } from "./classify.ts";
import { readCoversWait } from "./unreviewed.ts";
import { verdictSaysRequest } from "./verdict.ts";

/** A link to the client's chat in AIOS, or null when there is none. */
export type ChatLink = (clientId: string) => string | null;

/**
 * The reviews with the verdict that read their wait, when there is one: it
 * read the wait up to its last message, or up to a line followed only by
 * the client's thanks (or, while the wait's finding is open, by a receipt).
 * An open request stays reported whatever a later read says, so a read that
 * no longer sees a request (one that also read a receipt, say) never
 * describes it.
 */
export function withVerdicts(
  reviews: ThreadReview[],
  verdicts: Verdicts,
): ThreadReview[] {
  return reviews.map((review) => {
    const cached = verdicts.get(review.thread.key);
    if (
      !cached ||
      !readCoversWait(review.thread, cached.messageId, review.open)
    ) {
      return review;
    }
    if (review.open && !verdictSaysRequest(cached.verdict)) {
      return review;
    }
    return { ...review, verdict: cached.verdict };
  });
}

/** The unanswered_request findings the reviewed waits raise. */
export function requestCandidates(
  reviews: ThreadReview[],
  chatLink: ChatLink,
): FindingCandidate[] {
  return reviews.flatMap((review) => {
    const request =
      review.markers.request || verdictSaysRequest(review.verdict);
    if (!(review.slaBreached && request) && !review.open) {
      return [];
    }
    const { thread } = review;
    const link = threadLink(thread, chatLink);
    const { pending } = thread;
    const lowConfidence = isLowConfidence(pending);
    const quoted = thread.openToTeam;
    return [
      {
        kind: "unanswered_request",
        fingerprint: review.fingerprint,
        severity: lowConfidence ? "info" : "warning",
        client_id: thread.clientId,
        agency_id: null,
        source_event_at: (pending[0]?.at ?? new Date()).toISOString(),
        summary_he: requestSummary(thread, review.waitingHours, link),
        evidence: {
          thread: thread.kind,
          first_pending_at: pending[0]?.at.toISOString(),
          last_pending_at: pending.at(-1)?.at.toISOString(),
          pending_count: pending.length,
          waiting_business_hours: Math.round(review.waitingHours * 10) / 10,
          classified_by: review.verdict ? "llm" : "markers",
          low_confidence: lowConfidence,
          quote: quoteOf(thread, pending, "request") ?? undefined,
          llm_summary_he: quoted
            ? review.verdict?.summary_he || undefined
            : undefined,
          chat_link: link ?? undefined,
        },
        owner_user_id: null,
      },
    ];
  });
}

/** The chat link for a thread whose text is not quoted (DMs and private groups). */
export function threadLink(thread: Thread, chatLink: ChatLink): string | null {
  return thread.openToTeam ? null : chatLink(thread.clientId);
}
