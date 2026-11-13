// Copies a finished meeting-bot session's video from Recall into the private
// `recordings` bucket and sets the recording's file_path (AIO-588). Recall's
// download URL expires after six hours, so the stored copy is what keeps a
// meeting playable. meeting-bot-finalize starts it once the recording pipeline
// finishes. Callers: the service role only. Body: { session_id, tenant_id }.
import {
  extractRecallDownloads,
  retrieveRecallBot,
} from "../_shared/recall.ts";
import {
  isGatewayServiceRoleRequest,
  projectServiceRoleKeys,
} from "../_shared/auth/edge-caller-auth.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import {
  alreadyStored,
  loadSession,
  setRecordingFilePath,
  type StoreVideoParams,
  StoreVideoError,
} from "./session.ts";
import { tusUpload } from "./tus-upload.ts";

const BUCKET = "recordings";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!callerIsServiceRole(req)) {
    return json({ error: "Forbidden" }, 403);
  }
  const params = parseParams(await req.json().catch(() => ({})));
  if (!params) {
    return json({ error: "session_id and tenant_id are required" }, 400);
  }

  try {
    const admin = serviceClient();
    const session = await loadSession(admin, params);
    const path = `${session.tenant_id}/meeting_bot/${session.id}.mp4`;
    if (await alreadyStored(admin, session, path)) {
      return json({ stored: false, reason: "already stored", file_path: path });
    }
    const video = await openFreshVideo(session.external_bot_id);
    await uploadVideo(video, path);
    await setRecordingFilePath(admin, session, path);
    console.log(
      `[meeting-bot-store-video] session ${session.id}: stored ${video.length} bytes at ${path}`,
    );
    return json({ stored: true, file_path: path, bytes: video.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[meeting-bot-store-video] session ${params.sessionId} failed:`,
      message,
    );
    const status = err instanceof StoreVideoError ? err.status : 500;
    return json({ error: message }, status);
  }
});

interface FreshVideo {
  body: ReadableStream<Uint8Array>;
  length: number;
}

/** The service role only: verify_jwt is on, so the gateway checked the token. */
function callerIsServiceRole(req: Request): boolean {
  return isGatewayServiceRoleRequest(
    req.headers.get("Authorization"),
    projectServiceRoleKeys((name) => Deno.env.get(name)),
  );
}

/** The body's session and tenant ids, or null when either is missing. */
function parseParams(body: Record<string, unknown>): StoreVideoParams | null {
  const { session_id: sessionId, tenant_id: tenantId } = body;
  if (typeof sessionId !== "string" || !sessionId) {
    return null;
  }
  if (typeof tenantId !== "string" || !tenantId) {
    return null;
  }
  return { sessionId, tenantId };
}

/**
 * Opens the video from a download URL fetched now: the one saved on the row
 * may already have expired.
 */
async function openFreshVideo(botId: string): Promise<FreshVideo> {
  const { videoUrl } = extractRecallDownloads(await retrieveRecallBot(botId));
  if (!videoUrl) {
    throw new StoreVideoError("Recall has no video for this bot", 404);
  }

  const res = await fetch(videoUrl);
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw new Error(`Recall video download failed (${res.status})`);
  }
  // TUS needs the total up front; Recall's S3 responses always declare it.
  const length = Number(res.headers.get("content-length"));
  if (!Number.isSafeInteger(length) || length <= 0) {
    await res.body.cancel();
    throw new Error("Recall video response has no content-length");
  }
  return { body: res.body, length };
}

/** Streams the video into the recordings bucket, one chunk in memory at a time. */
async function uploadVideo(video: FreshVideo, path: string): Promise<void> {
  try {
    await tusUpload({
      endpoint: `${Deno.env.get("SUPABASE_URL")}/storage/v1/upload/resumable`,
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      bucket: BUCKET,
      objectName: path,
      contentType: "video/mp4",
      body: video.body,
      length: video.length,
    });
  } catch (err) {
    await video.body
      .cancel()
      .catch((cancelErr) =>
        console.error(
          "[meeting-bot-store-video] cancel download failed",
          cancelErr,
        ),
      );
    throw err;
  }
}

/** A JSON response. */
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
