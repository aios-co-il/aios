// Re-queues meeting-bot-store-video for finished sessions whose video never
// reached Storage (AIO-588): the copy failed, or its pg_net request was lost.
// Runs on reconcile's scheduled sweep while Recall still holds the media, and
// fails sessions that waited on their video past that window.
import {
  AWAITING_VIDEO,
  startVideoStorage,
  VIDEO_RETENTION_MS,
} from "../_shared/meeting-bot/video-storage.ts";
import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";

/**
 * Minimum gap between two copies of one session. Longer than an edge
 * function's wall clock, so a copy still running is never started twice.
 */
export const VIDEO_RETRY_INTERVAL_MS = 30 * 60 * 1000;

/** Copies queued per sweep; reconcile runs every minute. */
export const VIDEO_RETRY_BATCH_SIZE = 5;

export interface VideoRetryResult {
  requeued: Array<string>;
  expired: number;
}

/**
 * One retry pass. Logs and swallows its errors so finalizing still runs. Makes
 * its own typed service client unless given one (reconcile's is untyped).
 */
export async function retryVideoStorage(
  now: number,
  admin: DbClient = serviceClient(),
): Promise<VideoRetryResult> {
  try {
    const candidates = await findUnstoredVideos(admin, now);
    const claimed = await claimRetries(admin, candidates, now);
    for (const session of claimed) {
      await startVideoStorage(admin, session);
    }
    const expired = await failExpiredVideoWaits(admin, now);
    if (claimed.length || expired) {
      console.log(
        `[meeting-bot-reconcile] video retry: requeued ${claimed.length}, expired ${expired}`,
      );
    }
    return { requeued: claimed.map((session) => session.id), expired };
  } catch (err) {
    console.error("[meeting-bot-reconcile] video retry failed:", err);
    return { requeued: [], expired: 0 };
  }
}

interface SessionKey {
  id: string;
  tenant_id: string;
}

/**
 * Done sessions whose recording has Recall's video but no file_path, that
 * ended inside the retention window and were not touched for a retry interval.
 */
export async function findUnstoredVideos(
  admin: DbClient,
  now: number,
): Promise<Array<SessionKey>> {
  const { data, error } = await admin
    .from("meeting_bot_sessions")
    .select(
      "id, tenant_id, zoom_recordings!meeting_bot_sessions_zoom_recording_id_fkey!inner(file_path, recording_url)",
    )
    .eq("status", "done")
    .not("external_bot_id", "is", null)
    .is("zoom_recordings.file_path", null)
    .not("zoom_recordings.recording_url", "is", null)
    .gte("ended_at", new Date(now - VIDEO_RETENTION_MS).toISOString())
    .lt("updated_at", new Date(now - VIDEO_RETRY_INTERVAL_MS).toISOString())
    .order("updated_at", { ascending: true })
    .limit(VIDEO_RETRY_BATCH_SIZE);
  if (error) {
    throw new Error(`find unstored videos failed: ${error.message}`);
  }
  return (data ?? []).map(({ id, tenant_id }) => ({ id, tenant_id }));
}

/**
 * Bumps updated_at on the candidates still past the retry interval and returns
 * those rows: a lease, so two overlapping sweeps never queue one copy twice.
 */
async function claimRetries(
  admin: DbClient,
  candidates: Array<SessionKey>,
  now: number,
): Promise<Array<SessionKey>> {
  if (!candidates.length) {
    return [];
  }
  const { data, error } = await admin
    .from("meeting_bot_sessions")
    .update({ updated_at: new Date(now).toISOString() })
    .in(
      "id",
      candidates.map((session) => session.id),
    )
    .lt("updated_at", new Date(now - VIDEO_RETRY_INTERVAL_MS).toISOString())
    .select("id, tenant_id");
  if (error) {
    throw new Error(`claim video retries failed: ${error.message}`);
  }
  return data ?? [];
}

/** Fails sessions still waiting on their video once Recall's media is gone. */
async function failExpiredVideoWaits(
  admin: DbClient,
  now: number,
): Promise<number> {
  const { data, error } = await admin
    .from("meeting_bot_sessions")
    .update({
      status: "failed",
      error:
        "no transcript from Recall, no usable audio, and the video was never stored",
      updated_at: new Date(now).toISOString(),
    })
    .eq("status", "done")
    .eq("status_detail", AWAITING_VIDEO)
    .lt("ended_at", new Date(now - VIDEO_RETENTION_MS).toISOString())
    .select("id");
  if (error) {
    throw new Error(`fail expired video waits failed: ${error.message}`);
  }
  return data?.length ?? 0;
}
