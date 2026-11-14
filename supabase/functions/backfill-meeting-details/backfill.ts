// The backfill's per-meeting loop (AIO-589), apart from the handler so tests
// can pass a fake in place of applyMeetingDetailsFromSummary.
import type { MeetingDetailsOutcome } from "../_shared/meeting-details/apply.ts";
import type { MeetingDetailsPolicy } from "../_shared/meeting-details/plan.ts";
import { isDefaultMeetingName } from "./default-name.ts";

export interface SummarizedMeeting {
  id: string;
  meeting_topic: string | null;
  summary_md: string;
}

/** Names and assigns one meeting from its summary under the given policy. */
export type ApplyMeetingDetails = (
  meeting: SummarizedMeeting,
  policy: MeetingDetailsPolicy,
) => Promise<MeetingDetailsOutcome>;

/** One meeting's line in the response; `kept` means its name was left as is. */
export type BackfillResult = {
  id: string;
  before: string | null;
  kept: boolean;
} & (MeetingDetailsOutcome | { error: string });

export interface BackfillReport {
  results: Array<BackfillResult>;
  /** How many meetings kept their name because a person had named them. */
  kept: number;
}

/**
 * Applies each meeting's summary, renaming only meetings with a default name
 * and assigning clients to unassigned ones. A failed meeting is logged and
 * reported, and the rest still run.
 */
export async function backfillMeetings(
  meetings: Array<SummarizedMeeting>,
  applyDetails: ApplyMeetingDetails,
): Promise<BackfillReport> {
  const results: Array<BackfillResult> = [];
  for (const meeting of meetings) {
    const renameMeeting = isDefaultMeetingName(meeting.meeting_topic);
    const line = {
      id: meeting.id,
      before: meeting.meeting_topic,
      kept: !renameMeeting,
    };
    try {
      const outcome = await applyDetails(meeting, {
        assignClient: true,
        renameMeeting,
      });
      results.push({ ...line, ...outcome });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[backfill-meeting-details] failed", meeting.id, message);
      results.push({ ...line, error: message });
    }
  }
  return { results, kept: results.filter((result) => result.kept).length };
}
