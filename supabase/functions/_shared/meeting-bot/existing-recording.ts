// What a re-run of the meeting-bot finalize may change on a recording that an
// earlier run already created (AIO-587). The webhook and the reconcile cron can
// both finalize one session; the later run must not undo the earlier one.

import type { DbClient } from "../supabase-clients.ts";
import type { MeetingBotSession } from "../meeting-bot-finalize.ts";

/** The recording's name and whether a person chose it (AIO-563). */
export interface RecordingName {
  meeting_topic: string;
  topic_set_manually: boolean;
}

/** The zoom_recordings columns the finalize writes, besides the name. */
export interface MeetingBotRecordingFields {
  tenant_id: string;
  client_id: string | null;
  lead_id: string | null;
  agency_id: string | null;
  campaigner_ids: Array<string> | null;
  summary_scope: MeetingBotSession["summary_scope"];
  meeting_id: string;
  start_time: string;
  duration: number | null;
  source: "meeting_bot";
  recording_url: string | null;
  file_path?: string;
  transcription?: string;
  transcription_status?: "completed" | "pending";
}

/** The recording row an earlier finalize run left, as far as a re-run cares. */
export interface ExistingRecording {
  id: string;
  summary_generated_at: string | null;
}

/**
 * The row to write: a new recording takes the bot's name; an existing one keeps
 * its name, which the summary or a person may have changed since.
 */
export function recordingRowFor(
  fields: MeetingBotRecordingFields,
  name: RecordingName,
  existing: ExistingRecording | null,
): MeetingBotRecordingFields & Partial<RecordingName> {
  return existing ? fields : { ...fields, ...name };
}

/** True when an earlier run already summarized this recording. */
export function alreadySummarized(existing: ExistingRecording | null): boolean {
  return !!existing?.summary_generated_at;
}

/** The recording an earlier run made for this session, by id or by bot id. */
export async function findExistingRecording(
  admin: Pick<DbClient, "from">,
  session: { tenant_id: string; zoom_recording_id: string | null },
  botId: string,
): Promise<ExistingRecording | null> {
  const query = admin
    .from("zoom_recordings")
    .select("id, summary_generated_at")
    .eq("tenant_id", session.tenant_id);
  const { data, error } = await (
    session.zoom_recording_id
      ? query.eq("id", session.zoom_recording_id)
      : query.eq("meeting_id", botId)
  ).maybeSingle();
  if (error) {
    throw new Error(`recording lookup failed: ${error.message}`);
  }
  return data ?? null;
}

/**
 * A fresh read of the summary stamp, taken right before the pipeline runs: the
 * early read can be minutes old after the transcript and video downloads.
 */
export async function hasSummaryNow(
  admin: Pick<DbClient, "from">,
  tenantId: string,
  recordingId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("zoom_recordings")
    .select("summary_generated_at")
    .eq("tenant_id", tenantId)
    .eq("id", recordingId)
    .maybeSingle();
  if (error) {
    throw new Error(`summary check failed: ${error.message}`);
  }
  return !!data?.summary_generated_at;
}

/** Close a session whose recording an earlier run already summarized. */
export async function finishAlreadySummarized(
  admin: Pick<DbClient, "from">,
  session: { id: string; tenant_id: string },
): Promise<{ outcome: "done"; detail: string }> {
  const { error } = await admin
    .from("meeting_bot_sessions")
    .update({
      status: "done",
      status_detail: "already_summarized",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", session.tenant_id)
    .eq("id", session.id);
  if (error) {
    throw new Error(`session close failed: ${error.message}`);
  }
  return { outcome: "done", detail: "already summarized" };
}
