/**
 * Waits that ended: an open chat finding the run no longer reports, whose
 * thread now shows a staff reply or a completed call after the client began
 * waiting. It is closed as answered, with the response time on its event.
 * A finding whose thread left the read is left to auto-clear.
 */
import {
  type BusinessCalendar,
  businessHoursBetween,
} from "../../calendar/business-hours.ts";
import type { FindingCandidate, FindingResolution } from "../types.ts";
import { type LiveChatFinding, threadPrefix } from "./gate.ts";
import { firstStaffTurnAfter, type Thread } from "./threads.ts";

/** Resolutions for the open waits that staff answered. */
export function answeredWaits(
  threads: Thread[],
  live: LiveChatFinding[],
  reported: FindingCandidate[],
  calendar: BusinessCalendar,
): FindingResolution[] {
  const still = new Set(reported.map((c) => `${c.kind}|${c.fingerprint}`));
  return live.flatMap((finding): FindingResolution[] => {
    const thread = threads.find((t) =>
      finding.fingerprint.startsWith(threadPrefix(t.key)),
    );
    if (
      still.has(`${finding.kind}|${finding.fingerprint}`) ||
      !thread ||
      !finding.firstPendingAt
    ) {
      return [];
    }
    const since = new Date(finding.firstPendingAt);
    const reply = firstStaffTurnAfter(thread, since);
    if (!reply) {
      return [];
    }
    const minutes = (reply.at.getTime() - since.getTime()) / 60_000;
    const business = businessHoursBetween(since, reply.at, calendar);
    return [
      {
        kind: finding.kind,
        fingerprint: finding.fingerprint,
        resolution: "answered",
        details: {
          answered_at: reply.at.toISOString(),
          answered_by: reply.via,
          response_minutes: Math.round(minutes),
          response_business_hours: Math.round(business * 10) / 10,
        },
      },
    ];
  });
}
