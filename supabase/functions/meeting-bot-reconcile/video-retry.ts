// Re-queues meeting-bot-store-video for finished sessions whose video never
// reached Storage (AIO-588): the copy failed, or its pg_net request was lost.
// Runs on reconcile's scheduled sweep while Recall still holds the media, and
// fails sessions that waited on their video past that window.
import {
  startVideoStorage,
  VIDEO_RETENTION_MS,
  VIDEO_STORE_MAX_ATTEMPTS,
} from "../_shared/meeting-bot/video-storage.ts";
import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import {
  failExpiredVideoWaits,
  resumeStoredVideoWaits,
} from "./video-waits.ts";

/**
 * Minimum gap between two copies of one session. Longer than an edge
 * function's wall clock, so a copy still running is never started twice.
 */
export const VIDEO_RETRY_INTERVAL_MS = 30 * 60 * 1000;

/** Copies queued per sweep; reconcile runs every minute. */
export const VIDEO_RETRY_BATCH_SIZE = 5;

export interface VideoRetryResult {
  requeued: Array<string>;
  resumed: number;
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
    const resumed = await resumeStoredVideoWaits(admin, now);
    const expired = await failExpiredVideoWaits(admin, now);
    if (claimed.length || resumed || expired) {
      console.log(
        `[meeting-bot-reconcile] video retry: requeued ${claimed.length}, resumed ${resumed}, expired ${expired}`,
      );
    }
    return {
      requeued: claimed.map((session) => session.id),
      resumed,
      expired,
    };
  } catch (err) {
    console.error("[meeting-bot-reconcile] video retry failed:", err);
    return { requeued: [], resumed: 0, expired: 0 };
  }
}

interface SessionKey {
  id: string;
  tenant_id: string;
}

/** A retry candidate with the copies already queued for it. */
interface RetryCandidate extends SessionKey {
  video_store_attempts: number;
}

/**
 * Done sessions whose recording has Recall's video but no file_path, that
 * ended inside the retention window, were not touched for a retry interval,
 * and whose copy has neither failed permanently nor used up its attempts.
 */
export async function findUnstoredVideos(
  admin: DbClient,
  now: number,
): Promise<Array<RetryCandidate>> {
  const { data, error } = await admin
    .from("meeting_bot_sessions")
    .select(
      "id, tenant_id, video_store_attempts, zoom_recordings!meeting_bot_sessions_zoom_recording_id_fkey!inner(file_path, recording_url)",
    )
    .eq("status", "done")
    .not("external_bot_id", "is", null)
    .is("video_store_failed_at", null)
    .lt("video_store_attempts", VIDEO_STORE_MAX_ATTEMPTS)
    .is("zoom_recordings.file_path", null)
    .not("zoom_recordings.recording_url", "is", null)
    .gte("ended_at", new Date(now - VIDEO_RETENTION_MS).toISOString())
    .lt("updated_at", new Date(now - VIDEO_RETRY_INTERVAL_MS).toISOString())
    .order("updated_at", { ascending: true })
    .limit(VIDEO_RETRY_BATCH_SIZE);
  if (error) {
    throw new Error(`find unstored videos failed: ${error.message}`);
  }
  return (data ?? []).map(({ id, tenant_id, video_store_attempts }) => ({
    id,
    tenant_id,
    video_store_attempts,
  }));
}

/**
 * Bumps updated_at and counts the attempt on the candidates still past the
 * retry interval and returns those rows: a lease, so two overlapping sweeps
 * never queue one copy twice.
 */
async function claimRetries(
  admin: DbClient,
  candidates: Array<RetryCandidate>,
  now: number,
): Promise<Array<SessionKey>> {
  const claimed: Array<SessionKey> = [];
  for (const candidate of candidates) {
    const { data, error } = await admin
      .from("meeting_bot_sessions")
      .update({
        updated_at: new Date(now).toISOString(),
        video_store_attempts: candidate.video_store_attempts + 1,
      })
      .eq("id", candidate.id)
      .eq("tenant_id", candidate.tenant_id)
      .eq("video_store_attempts", candidate.video_store_attempts)
      .lt("updated_at", new Date(now - VIDEO_RETRY_INTERVAL_MS).toISOString())
      .select("id, tenant_id");
    if (error) {
      throw new Error(`claim video retries failed: ${error.message}`);
    }
    claimed.push(...(data ?? []));
  }
  return claimed;
}
