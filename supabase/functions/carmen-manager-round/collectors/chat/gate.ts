/**
 * Which client waits need a look, and the identity of each wait. A thread is
 * looked at while the client still waits (pending turns) and the wait is
 * past the tenant's SLA in business hours, or reads as a complaint (any
 * age), or already has an open finding. A wait is fingerprinted by its first
 * client message, so a staff reply ends it and the next message starts a new
 * one; a wait that began before the read window keeps its open finding's
 * fingerprint instead of drifting as old messages leave the window.
 */
import type { FindingKind } from "../../../_shared/manager-round/kinds.ts";
import type { ManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { businessHoursBetween } from "../../calendar/business-hours.ts";
import { type Markers, readMarkers } from "./markers.ts";
import type { Thread } from "./threads.ts";
import type { ChatVerdict } from "./verdict.ts";

/** An open finding of the chat collector. */
export type LiveChatFinding = {
  kind: FindingKind;
  fingerprint: string;
  /** evidence.first_pending_at: when the client started waiting. */
  firstPendingAt: string | null;
};

export type ThreadReview = {
  thread: Thread;
  fingerprint: string;
  /** Kinds already open for this wait (they stay open while it lasts). */
  openKinds: FindingKind[];
  markers: Markers;
  waitingHours: number;
  slaBreached: boolean;
  verdict: ChatVerdict | null;
};

/** The waits to review now, with their markers and business-hours age. */
export function gateThreads(
  threads: Thread[],
  live: LiveChatFinding[],
  settings: ManagerSettings,
  now: Date,
): ThreadReview[] {
  return threads.flatMap((thread): ThreadReview[] => {
    const [first] = thread.pending;
    if (!first) {
      return [];
    }
    const fingerprint = waitFingerprint(thread, live);
    const openKinds = live
      .filter((finding) => finding.fingerprint === fingerprint)
      .map((finding) => finding.kind);
    const markers = readMarkers(thread.pending.map((turn) => turn.text));
    const waitingHours = businessHoursBetween(first.at, now, settings);
    const slaBreached = waitingHours >= settings.sla_business_hours;
    const due = slaBreached || markers.complaint || openKinds.length > 0;
    return due
      ? [
          {
            thread,
            fingerprint,
            openKinds,
            markers,
            waitingHours,
            slaBreached,
            verdict: null,
          },
        ]
      : [];
  });
}

/** Every chat finding of a thread starts with this. */
export function threadPrefix(threadKey: string): string {
  return `chat:${threadKey}:`;
}

/**
 * The wait's fingerprint: its first client message. With no staff turn in
 * the read, the wait may have started earlier, so an open finding of the
 * thread keeps its fingerprint.
 */
export function waitFingerprint(
  thread: Thread,
  live: LiveChatFinding[],
): string {
  const prefix = threadPrefix(thread.key);
  const unanchored = !thread.turns.some((turn) => turn.by === "staff");
  const kept = unanchored
    ? live
        .filter((finding) => finding.fingerprint.startsWith(prefix))
        .sort((a, b) =>
          (a.firstPendingAt ?? "").localeCompare(b.firstPendingAt ?? ""),
        )[0]
    : undefined;
  return kept?.fingerprint ?? `${prefix}${thread.pending[0]?.id ?? "none"}`;
}
