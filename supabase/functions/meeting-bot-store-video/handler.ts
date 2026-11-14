// Request handling for meeting-bot-store-video. index.ts wires in Recall, TUS
// and the service client; the tests pass fakes.
import { meetingBotMediaPath } from "../_shared/meeting-bot/video-storage.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import {
  alreadyStored,
  loadSession,
  resumeAwaitingSession,
  setRecordingFilePath,
  type StoredSession,
  type StoreVideoParams,
  StoreVideoError,
} from "./session.ts";

const LOG = "[meeting-bot-store-video]";

/**
 * Validates the caller and the session, opens Recall's video, then answers 202
 * and streams the copy in the background: a multi-GB copy outlasts pg_net's
 * 150s request timeout, and a closed connection must not cut it short.
 */
export async function handleStoreVideo(
  req: Request,
  deps: StoreVideoDeps,
): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!deps.isServiceRole(req)) {
    console.error(`${LOG} 403: caller is not the service role`);
    return json({ error: "Forbidden" }, 403);
  }
  const params = parseParams(await readBody(req));
  if (!params) {
    return json({ error: "session_id and tenant_id are required" }, 400);
  }

  try {
    const session = await loadSession(deps.admin, params);
    const path = meetingBotMediaPath(session, "mp4");
    if (await alreadyStored(deps.admin, session, path)) {
      return json({ stored: false, reason: "already stored", file_path: path });
    }
    const video = await deps.openVideo(session.external_bot_id);
    deps.runInBackground(copyVideo(deps, session, video, path));
    return json({ accepted: true, file_path: path, bytes: video.length }, 202);
  } catch (err) {
    return errorResponse(params, err);
  }
}

/** Recall's video, opened with a download URL fetched for this request. */
export interface FreshVideo {
  body: ReadableStream<Uint8Array>;
  length: number;
}

export interface StoreVideoDeps {
  admin: DbClient;
  isServiceRole(req: Request): boolean;
  /** Throws StoreVideoError for an answer the caller should see as non-2xx. */
  openVideo(botId: string): Promise<FreshVideo>;
  upload(video: FreshVideo, path: string): Promise<void>;
  /** Keeps the isolate alive until the task settles (EdgeRuntime.waitUntil). */
  runInBackground(task: Promise<void>): void;
}

/** The JSON body, or {} after logging one that does not parse. */
async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch (err) {
    console.error(`${LOG} body is not JSON:`, err);
    return {};
  }
}

/** The body's session and tenant ids, or null (logged) when either is missing. */
function parseParams(body: Record<string, unknown>): StoreVideoParams | null {
  const { session_id: sessionId, tenant_id: tenantId } = body;
  if (
    typeof sessionId === "string" &&
    sessionId &&
    typeof tenantId === "string" &&
    tenantId
  ) {
    return { sessionId, tenantId };
  }
  console.error(`${LOG} 400: rejected body`, {
    keys: Object.keys(body),
    session_id: sessionId ?? null,
    tenant_id: tenantId ?? null,
  });
  return null;
}

/** Streams the video into Storage, then points the recording at it. */
async function copyVideo(
  deps: StoreVideoDeps,
  session: StoredSession,
  video: FreshVideo,
  path: string,
): Promise<void> {
  try {
    await deps.upload(video, path);
    await setRecordingFilePath(deps.admin, session, path);
    await resumeAwaitingSession(deps.admin, session);
    console.log(
      `${LOG} session ${session.id}: stored ${video.length} bytes at ${path}`,
    );
  } catch (err) {
    // Reconcile's video retry copies it again while Recall still has it.
    console.error(`${LOG} session ${session.id}: copy failed:`, err);
  }
}

/** Expected failures keep their message; anything else is a generic 500. */
function errorResponse(params: StoreVideoParams, err: unknown): Response {
  console.error(`${LOG} session ${params.sessionId} failed:`, err);
  if (err instanceof StoreVideoError) {
    return json({ error: err.message }, err.status);
  }
  return json({ error: "Internal error" }, 500);
}

/** A JSON response. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
