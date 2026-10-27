/**
 * client_complaint findings, one per client streak that reads as a
 * complaint (the shared complaint words, or a confident verdict on the
 * latest streak), at any age and whether or not staff already answered: a
 * reply does not settle a complaint, a person does. The streak's first
 * message names the finding. A complaint stays reported while its message is
 * in the read window, as stored, even after it leaves the thread's last
 * messages; a person acknowledges or resolves it.
 */
import type { FindingCandidate } from "../types.ts";
import { type ChatLink, threadLink } from "./candidates.ts";
import type { Verdicts } from "./classify.ts";
import { type LiveChatFinding, threadPrefix } from "./gate.ts";
import { readMarkers } from "./markers.ts";
import { type ClientStreak, clientStreaks } from "./streaks.ts";
import { complaintSummary, isLowConfidence, quoteOf } from "./summary.ts";
import type { Thread } from "./threads.ts";
import { type ChatVerdict, verdictSaysComplaint } from "./verdict.ts";

/** The complaints the threads show, and the open ones still in the read window. */
export function complaintCandidates(
  threads: Thread[],
  verdicts: Verdicts,
  live: LiveChatFinding[],
  scope: { since: Date; clientIds: string[] | null; chatLink: ChatLink },
): FindingCandidate[] {
  const open = live.filter((finding) => finding.kind === "client_complaint");
  const found = threads.flatMap((thread) =>
    clientStreaks(thread).flatMap((streak, index, all) => {
      const verdict =
        index === all.length - 1
          ? modelSaysComplaint(verdicts, thread, streak)
          : null;
      const words = readMarkers(streak.turns.map((t) => t.text)).complaint;
      if (!(words || verdict) || startedBeforeRead(thread, streak, open)) {
        return [];
      }
      return [complaint(thread, streak, words ? null : verdict, scope)];
    }),
  );
  const reported = new Set(found.map((c) => c.fingerprint));
  const kept = open.flatMap((finding) =>
    !reported.has(finding.fingerprint) && inScope(finding.stored, scope)
      ? [finding.stored]
      : [],
  );
  return [...found, ...kept];
}

/** Every complaint finding of a thread starts with this. */
export function complaintPrefix(threadKey: string): string {
  return `${threadPrefix(threadKey)}complaint:`;
}

/** The verdict on the streak's last message when it confidently reads as a complaint. */
function modelSaysComplaint(
  verdicts: Verdicts,
  thread: Thread,
  streak: ClientStreak,
): ChatVerdict | null {
  const cached = verdicts.get(thread.key);
  return cached &&
    cached.messageId === streak.turns.at(-1)?.id &&
    verdictSaysComplaint(cached.verdict)
    ? cached.verdict
    : null;
}

/**
 * A streak with no staff turn before it in the read may have begun earlier;
 * when an open complaint of the thread is older than the read, that one is it.
 */
function startedBeforeRead(
  thread: Thread,
  streak: ClientStreak,
  open: LiveChatFinding[],
): boolean {
  const first = streak.turns[0].at.getTime();
  return (
    !streak.anchored &&
    open.some(
      (finding) =>
        finding.fingerprint.startsWith(complaintPrefix(thread.key)) &&
        Date.parse(finding.stored.source_event_at) < first,
    )
  );
}

/** One complaint finding for the streak; `verdict` when only the model saw it. */
function complaint(
  thread: Thread,
  streak: ClientStreak,
  verdict: ChatVerdict | null,
  scope: { chatLink: ChatLink },
): FindingCandidate {
  const { turns } = streak;
  const link = threadLink(thread, scope.chatLink);
  const lowConfidence = isLowConfidence(turns);
  return {
    kind: "client_complaint",
    fingerprint: `${complaintPrefix(thread.key)}${turns[0].id}`,
    severity: lowConfidence ? "info" : "warning",
    client_id: thread.clientId,
    agency_id: null,
    source_event_at: turns[0].at.toISOString(),
    summary_he: complaintSummary(thread, turns, link),
    evidence: {
      thread: thread.kind,
      first_message_at: turns[0].at.toISOString(),
      last_message_at: turns.at(-1)?.at.toISOString(),
      message_count: turns.length,
      classified_by: verdict ? "llm" : "markers",
      low_confidence: lowConfidence,
      quote: quoteOf(thread, turns, "complaint") ?? undefined,
      llm_summary_he: thread.openToTeam
        ? verdict?.summary_he || undefined
        : undefined,
      chat_link: link ?? undefined,
    },
    owner_user_id: null,
  };
}

/** A stored complaint still in the read window and the run's clients. */
function inScope(
  stored: FindingCandidate,
  scope: { since: Date; clientIds: string[] | null },
): boolean {
  return (
    Date.parse(stored.source_event_at) >= scope.since.getTime() &&
    (!scope.clientIds ||
      (!!stored.client_id && scope.clientIds.includes(stored.client_id)))
  );
}
