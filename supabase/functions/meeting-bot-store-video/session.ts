// The meeting-bot session and recording rows meeting-bot-store-video reads and
// writes, always filtered by the session's tenant.
import type { MeetingBotSession } from "../_shared/meeting-bot-finalize.ts";
import {
  AWAITING_VIDEO,
  VIDEO_STORED,
} from "../_shared/meeting-bot/video-storage.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

export interface StoreVideoParams {
  sessionId: string;
  tenantId: string;
}

/** A session with the Recall bot and recording row a copy needs. */
export type StoredSession = Pick<MeetingBotSession, "id" | "tenant_id"> & {
  [K in "external_bot_id" | "zoom_recording_id"]: NonNullable<
    MeetingBotSession[K]
  >;
};

/** An expected failure with the HTTP status the caller gets. */
export class StoreVideoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The tenant's session, which must have a Recall bot and a recording row. */
export async function loadSession(
  admin: DbClient,
  params: StoreVideoParams,
): Promise<StoredSession> {
  const { data, error } = await admin
    .from("meeting_bot_sessions")
    .select("id, tenant_id, external_bot_id, zoom_recording_id")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.sessionId)
    .maybeSingle();
  if (error) {
    throw new Error(`load session failed: ${error.message}`);
  }
  if (!data) {
    throw new StoreVideoError("session not found", 404);
  }
  const { external_bot_id: botId, zoom_recording_id: recordingId } = data;
  if (!botId) {
    throw new StoreVideoError("session has no external_bot_id", 409);
  }
  if (!recordingId) {
    throw new StoreVideoError("session has no zoom_recording_id", 409);
  }
  return {
    id: data.id,
    tenant_id: data.tenant_id,
    external_bot_id: botId,
    zoom_recording_id: recordingId,
  };
}

/** True when the recording already points at this session's stored video. */
export async function alreadyStored(
  admin: DbClient,
  session: StoredSession,
  path: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("zoom_recordings")
    .select("file_path")
    .eq("tenant_id", session.tenant_id)
    .eq("id", session.zoom_recording_id)
    .maybeSingle();
  if (error) {
    throw new Error(`load recording failed: ${error.message}`);
  }
  if (!data) {
    throw new StoreVideoError("recording not found", 404);
  }
  return data.file_path === path;
}

/** Points the session's recording at the stored video. */
export async function setRecordingFilePath(
  admin: DbClient,
  session: StoredSession,
  path: string,
): Promise<void> {
  const { error } = await admin
    .from("zoom_recordings")
    .update({ file_path: path })
    .eq("tenant_id", session.tenant_id)
    .eq("id", session.zoom_recording_id);
  if (error) {
    throw new Error(`set file_path failed: ${error.message}`);
  }
}

/**
 * Hands a session finalize parked on its video back to the reconcile sweep,
 * which then transcribes it from file_path. Matches nothing for any other
 * session, so a plain copy leaves the session as it is.
 */
export async function resumeAwaitingSession(
  admin: DbClient,
  session: StoredSession,
): Promise<void> {
  const { error } = await admin
    .from("meeting_bot_sessions")
    .update({
      status: "processing",
      status_detail: VIDEO_STORED,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", session.tenant_id)
    .eq("id", session.id)
    .eq("status", "done")
    .eq("status_detail", AWAITING_VIDEO);
  if (error) {
    throw new Error(`resume awaiting session failed: ${error.message}`);
  }
}
