/**
 * Which client waits need a look, and the identity of each wait. A wait (the
 * client turns after the last staff turn) is looked at once it is past the
 * tenant's SLA in business hours, or while its unanswered_request is open. A
 * wait is fingerprinted by its first client message, so a staff reply ends
 * it and the next message starts a new one; a wait that began before the
 * read window keeps its open finding's fingerprint instead of drifting as old
 * messages leave the window. Complaints are read per client streak, at any
 * age (complaints.ts).
 */
import type { FindingKind } from "../../../_shared/manager-round/kinds.ts";
import type { ManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { businessHoursBetween } from "../../calendar/business-hours.ts";
import type { FindingCandidate } from "../types.ts";
import { type Markers, readMarkers } from "./markers.ts";
import type { Thread } from "./threads.ts";
import type { ChatVerdict } from "./verdict.ts";

/** An open finding of the chat collector. */
export type LiveChatFinding = {
  kind: FindingKind;
  fingerprint: string;
  /** evidence.first_pending_at: when the client started waiting. */
  firstPendingAt: string | null;
  /** The finding as stored, to report it again unchanged. */
  stored: FindingCandidate;
};

export type ThreadReview = {
  thread: Thread;
  fingerprint: string;
  /** Its unanswered_request is already open (it stays while the wait lasts). */
  open: boolean;
  markers: Markers;
  waitingHours: number;
  slaBreached: boolean;
  /** The model's read of the wait, when it read this wait's last message. */
  verdict: ChatVerdict | null;
};

/** The waits to review now, with their markers and business-hours age. */
export function gateThreads(
  threads: Thread[],
  live: LiveChatFinding[],
  settings: ManagerSettings,
  now: Date,
): ThreadReview[] {
  const requests = live.filter((f) => f.kind === "unanswered_request");
  return threads.flatMap((thread): ThreadReview[] => {
    const [first] = thread.pending;
    if (!first) {
      return [];
    }
    const fingerprint = waitFingerprint(thread, requests);
    const open = requests.some((f) => f.fingerprint === fingerprint);
    const waitingHours = businessHoursBetween(first.at, now, settings);
    const slaBreached = waitingHours >= settings.unanswered_reply_hours;
    if (!slaBreached && !open) {
      return [];
    }
    const markers = readMarkers(thread.pending.map((turn) => turn.text));
    return [
      {
        thread,
        fingerprint,
        open,
        markers,
        waitingHours,
        slaBreached,
        verdict: null,
      },
    ];
  });
}

/** Every chat finding of a thread starts with this. */
export function threadPrefix(threadKey: string): string {
  return `chat:${threadKey}:`;
}

/**
 * The wait's fingerprint: its first client message. With no staff turn in
 * the read, the wait may have started earlier, so the thread's open
 * unanswered_request keeps its fingerprint.
 */
export function waitFingerprint(
  thread: Thread,
  requests: LiveChatFinding[],
): string {
  const prefix = threadPrefix(thread.key);
  const unanchored = !thread.turns.some((turn) => turn.by === "staff");
  const kept = unanchored
    ? requests
        .filter((finding) => finding.fingerprint.startsWith(prefix))
        .sort((a, b) =>
          (a.firstPendingAt ?? "").localeCompare(b.firstPendingAt ?? ""),
        )[0]
    : undefined;
  return kept?.fingerprint ?? `${prefix}${thread.pending[0]?.id ?? "none"}`;
}
