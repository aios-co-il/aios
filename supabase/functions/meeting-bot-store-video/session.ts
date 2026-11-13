// The meeting-bot session and recording rows meeting-bot-store-video reads and
// writes, always filtered by the session's tenant.
import type { DbClient } from "../_shared/supabase-clients.ts";

export interface StoreVideoParams {
  sessionId: string;
  tenantId: string;
}

export interface StoredSession {
  id: string;
  tenant_id: string;
  external_bot_id: string;
  zoom_recording_id: string;
}

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
  if (!data.external_bot_id) {
    throw new StoreVideoError("session has no external_bot_id", 409);
  }
  if (!data.zoom_recording_id) {
    throw new StoreVideoError("session has no zoom_recording_id", 409);
  }
  return {
    id: data.id,
    tenant_id: data.tenant_id,
    external_bot_id: data.external_bot_id,
    zoom_recording_id: data.zoom_recording_id,
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
