// What a re-run of the meeting-bot finalize may change on a recording that an
// earlier run already created (AIO-587). The webhook and the reconcile cron can
// both finalize one session; the later run must not undo the earlier one.

import type { DbClient } from "../supabase-clients.ts";

/** Columns that carry the bot's name, which a re-run must not write again. */
const BOT_NAME_COLUMNS = new Set(["meeting_topic", "topic_set_manually"]);

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
  row: Record<string, unknown>,
  existing: ExistingRecording | null,
): Record<string, unknown> {
  if (!existing) {
    return row;
  }
  return Object.fromEntries(
    Object.entries(row).filter(([column]) => !BOT_NAME_COLUMNS.has(column)),
  );
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
