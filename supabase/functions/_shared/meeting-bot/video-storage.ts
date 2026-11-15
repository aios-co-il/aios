// Where a meeting-bot session's media lives in Storage, and how its video copy
// is started (AIO-588). meeting-bot-finalize, meeting-bot-store-video and
// meeting-bot-reconcile share these names so a session moves between them by
// the same status_detail values.
import { kickNextBatch } from "../kick-next-batch.ts";
import type { MeetingBotSession } from "../meeting-bot-finalize.ts";

/** The private bucket meeting-bot media is uploaded to. */
export const RECORDINGS_BUCKET = "recordings";

/** The edge function that streams a session's video into Storage. */
export const STORE_VIDEO_FUNCTION = "meeting-bot-store-video";

/**
 * status_detail of a `done` session whose only transcribable source is its
 * video: no Recall transcript and no usable audio. The store function moves it
 * back to `processing` once the video is stored, and reconcile finalizes it.
 */
export const AWAITING_VIDEO = "awaiting_video";

/** status_detail the store function sets when it resumes an awaiting session. */
export const VIDEO_STORED = "video_stored";

/**
 * How long after a meeting ends we still ask Recall for its video. Recall's
 * media retention depends on the plan; three days stays well inside it.
 */
export const VIDEO_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

type SessionKey = Pick<MeetingBotSession, "id" | "tenant_id">;

type KickClient = Parameters<typeof kickNextBatch>[0];

/** `<tenant_id>/meeting_bot/<session_id>.<extension>` in the recordings bucket. */
export function meetingBotMediaPath(
  session: SessionKey,
  extension: "mp4" | "mp3",
): string {
  return `${session.tenant_id}/meeting_bot/${session.id}.${extension}`;
}

/**
 * Queues meeting-bot-store-video for the session in pg_net, so the copy runs on
 * its own and outlives the caller's isolate. The store function skips a video
 * that is already stored, so starting it twice is harmless.
 */
export function startVideoStorage(
  admin: KickClient,
  session: SessionKey,
): Promise<void> {
  return kickNextBatch(admin, STORE_VIDEO_FUNCTION, {
    session_id: session.id,
    tenant_id: session.tenant_id,
  });
}

/** True while Recall should still hold the video of a meeting that ended then. */
export function withinVideoRetention(
  endedAt: string | null,
  now: number,
): boolean {
  if (!endedAt) {
    return false;
  }
  return now - new Date(endedAt).getTime() <= VIDEO_RETENTION_MS;
}
