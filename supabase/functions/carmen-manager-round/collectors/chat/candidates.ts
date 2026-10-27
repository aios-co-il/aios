/**
 * Findings from the reviewed waits. unanswered_request: the wait is past the
 * SLA and reads as a request (markers, or a confident LLM verdict that can
 * only add). client_complaint: it reads as a complaint, at any age. A kind
 * already open for the wait stays reported while the client waits, so a
 * changed verdict never drops it. Direct-chat text is never put in a summary
 * or in the evidence campaigners can read.
 */
import type { FindingKind } from "../../../_shared/manager-round/kinds.ts";
import type { FindingCandidate } from "../types.ts";
import type { ThreadReview } from "./gate.ts";
import {
  complaintSummary,
  isLowConfidence,
  quoteOf,
  requestSummary,
} from "./summary.ts";
import { verdictSaysComplaint, verdictSaysRequest } from "./verdict.ts";

/** A link to the client's chat in AIOS, or null when there is none. */
export type ChatLink = (clientId: string) => string | null;

/** The findings the reviewed waits raise. */
export function waitCandidates(
  reviews: ThreadReview[],
  chatLink: ChatLink,
): FindingCandidate[] {
  return reviews.flatMap((review) => {
    const link =
      review.thread.kind === "dm" ? chatLink(review.thread.clientId) : null;
    const open = (kind: FindingKind) => review.openKinds.includes(kind);
    const request =
      review.markers.request || verdictSaysRequest(review.verdict);
    const complaint =
      review.markers.complaint ||
      verdictSaysComplaint(review.verdict) ||
      open("client_complaint");
    const found: FindingCandidate[] = [];
    if ((review.slaBreached && request) || open("unanswered_request")) {
      found.push(
        candidate(
          review,
          "unanswered_request",
          requestSummary(review, link),
          link,
        ),
      );
    }
    if (complaint) {
      found.push(
        candidate(
          review,
          "client_complaint",
          complaintSummary(review, link),
          link,
        ),
      );
    }
    return found;
  });
}

/** One finding of `kind` for the wait. */
function candidate(
  review: ThreadReview,
  kind: FindingKind,
  summary: string,
  link: string | null,
): FindingCandidate {
  const { pending, kind: threadKind } = review.thread;
  const lowConfidence = isLowConfidence(review);
  const group = threadKind === "group";
  return {
    kind,
    fingerprint: review.fingerprint,
    severity: lowConfidence ? "info" : "warning",
    client_id: review.thread.clientId,
    agency_id: null,
    source_event_at: (pending[0]?.at ?? new Date()).toISOString(),
    summary_he: summary,
    evidence: {
      thread: threadKind,
      first_pending_at: pending[0]?.at.toISOString(),
      last_pending_at: pending.at(-1)?.at.toISOString(),
      pending_count: pending.length,
      waiting_business_hours: Math.round(review.waitingHours * 10) / 10,
      classified_by: review.verdict ? "llm" : "markers",
      low_confidence: lowConfidence,
      quote: group
        ? (quoteOf(
            review,
            kind === "client_complaint" ? "complaint" : "request",
          ) ?? undefined)
        : undefined,
      llm_summary_he: group
        ? review.verdict?.summary_he || undefined
        : undefined,
      chat_link: link ?? undefined,
    },
    owner_user_id: null,
  };
}
