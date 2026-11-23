// Sweeps the meeting-bot sessions finalize parked on their video (AIO-588):
// hands back the ones whose video got stored and fails the ones no retry can
// help any more. Part of meeting-bot-reconcile's video retry pass.
import {
  AWAITING_VIDEO,
  VIDEO_RETENTION_MS,
  VIDEO_STORE_MAX_ATTEMPTS,
  VIDEO_STORED,
} from "../_shared/meeting-bot/video-storage.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import {
  VIDEO_RETRY_BATCH_SIZE,
  VIDEO_RETRY_INTERVAL_MS,
} from "./video-retry.ts";

/**
 * Hands back to reconcile the sessions whose video is stored but still wait on
 * it: the store function saved file_path and then failed to resume them.
 */
export async function resumeStoredVideoWaits(
  admin: DbClient,
  now: number,
): Promise<number> {
  const { data: stored, error: findError } = await admin
    .from("meeting_bot_sessions")
    .select(
      "id, tenant_id, zoom_recordings!meeting_bot_sessions_zoom_recording_id_fkey!inner(file_path)",
    )
    .eq("status", "done")
    .eq("status_detail", AWAITING_VIDEO)
    .not("zoom_recordings.file_path", "is", null)
    .limit(VIDEO_RETRY_BATCH_SIZE);
  if (findError) {
    throw new Error(`find stored video waits failed: ${findError.message}`);
  }
  let resumed = 0;
  for (const session of stored ?? []) {
    const { data, error } = await admin
      .from("meeting_bot_sessions")
      .update({
        status: "processing",
        status_detail: VIDEO_STORED,
        updated_at: new Date(now).toISOString(),
      })
      .eq("id", session.id)
      .eq("tenant_id", session.tenant_id)
      .eq("status", "done")
      .eq("status_detail", AWAITING_VIDEO)
      .select("id");
    if (error) {
      throw new Error(`resume stored video waits failed: ${error.message}`);
    }
    resumed += data?.length ?? 0;
  }
  return resumed;
}

/**
 * Fails sessions still waiting on their video once no retry is left: Recall's
 * media is gone, the copy failed permanently, or it used up its attempts. A
 * session leased for a retry within the last interval is left to finish.
 */
export async function failExpiredVideoWaits(
  admin: DbClient,
  now: number,
): Promise<number> {
  const retentionCutoff = new Date(now - VIDEO_RETENTION_MS).toISOString();
  const leaseCutoff = new Date(now - VIDEO_RETRY_INTERVAL_MS).toISOString();
  // Only sessions whose video never reached Storage; a stored one waits for
  // resumeStoredVideoWaits however many sweeps that takes.
  const { data: unstored, error: findError } = await admin
    .from("meeting_bot_sessions")
    .select(
      "id, tenant_id, zoom_recordings!meeting_bot_sessions_zoom_recording_id_fkey!inner(file_path)",
    )
    .eq("status", "done")
    .eq("status_detail", AWAITING_VIDEO)
    .is("zoom_recordings.file_path", null)
    .or(
      `ended_at.lt.${retentionCutoff},video_store_failed_at.not.is.null,video_store_attempts.gte.${VIDEO_STORE_MAX_ATTEMPTS}`,
    )
    .lt("updated_at", leaseCutoff)
    .limit(VIDEO_RETRY_BATCH_SIZE);
  if (findError) {
    throw new Error(`find expired video waits failed: ${findError.message}`);
  }
  let expired = 0;
  for (const session of unstored ?? []) {
    const { data, error } = await admin
      .from("meeting_bot_sessions")
      .update({
        status: "failed",
        error:
          "no transcript from Recall, no usable audio, and the video was never stored",
        updated_at: new Date(now).toISOString(),
      })
      .eq("id", session.id)
      .eq("tenant_id", session.tenant_id)
      .eq("status", "done")
      .eq("status_detail", AWAITING_VIDEO)
      .lt("updated_at", leaseCutoff)
      .select("id");
    if (error) {
      throw new Error(`fail expired video waits failed: ${error.message}`);
    }
    expired += data?.length ?? 0;
  }
  return expired;
}
