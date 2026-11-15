// Copies a finished meeting-bot session's video from Recall into the private
// `recordings` bucket and sets the recording's file_path (AIO-588). Recall's
// download URL expires after six hours, so the stored copy is what keeps a
// meeting playable. meeting-bot-finalize and meeting-bot-reconcile's video
// retry queue it through pg_net (kick_internal_function). Callers: the service
// role only. Body: { session_id, tenant_id }.
import type {} from "../_shared/edge-runtime.d.ts";
import {
  extractRecallDownloads,
  retrieveRecallBot,
} from "../_shared/recall.ts";
import {
  isGatewayServiceRoleRequest,
  projectServiceRoleKeys,
} from "../_shared/auth/edge-caller-auth.ts";
import { RECORDINGS_BUCKET } from "../_shared/meeting-bot/video-storage.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import {
  type FreshVideo,
  handleStoreVideo,
  json,
  type StoreVideoDeps,
} from "./handler.ts";
import { StoreVideoError } from "./session.ts";
import { tusUpload } from "./tus-upload.ts";

Deno.serve(async (req) => {
  try {
    return await handleStoreVideo(req, liveDeps());
  } catch (err) {
    console.error("[meeting-bot-store-video] request failed:", err);
    return json({ error: "Internal error" }, 500);
  }
});

/** Recall, TUS and the service client, after checking the env they need. */
function liveDeps(): StoreVideoDeps {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    admin: serviceClient(),
    isServiceRole: (req) =>
      isGatewayServiceRoleRequest(
        req.headers.get("Authorization"),
        projectServiceRoleKeys((name) => Deno.env.get(name)),
      ),
    openVideo: openFreshVideo,
    upload: (video, path) =>
      uploadVideo(video, path, {
        endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
        serviceKey,
      }),
    runInBackground: (task) => EdgeRuntime.waitUntil(task),
  };
}

/** The env value, or a clear error naming the missing variable. */
function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
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
  // TUS create needs the total size. Recall's S3 responses declare it; without
  // it we stop with a 502 rather than defer the length, which Supabase's
  // resumable endpoint is not documented to support.
  const length = Number(res.headers.get("content-length"));
  if (!Number.isSafeInteger(length) || length <= 0) {
    await res.body.cancel();
    throw new StoreVideoError(
      "Recall video response has no content-length",
      502,
    );
  }
  return { body: res.body, length };
}

/** Streams the video into the recordings bucket, one chunk in memory at a time. */
async function uploadVideo(
  video: FreshVideo,
  path: string,
  target: { endpoint: string; serviceKey: string },
): Promise<void> {
  try {
    await tusUpload({
      ...target,
      bucket: RECORDINGS_BUCKET,
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
