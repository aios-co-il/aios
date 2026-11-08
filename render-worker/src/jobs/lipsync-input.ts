/** What a lip-sync provider is sent for a scene (lipsync-submit.ts). */
import {
  assertTenantPath,
  finalError,
  readMedia,
  safeSegment,
  storedObject,
} from "../guard.ts";
import { audioMime } from "../providers/lipsync.ts";
import type { LipsyncProvider, MediaInput } from "../providers/types.ts";
import type { SupabaseRest } from "../supabaseRest.ts";
import { BUCKET } from "./lipsync-finish.ts";
import { publicStill } from "./still-image.ts";
import type { MediaAsset, RunItem, VideoRun } from "./types.ts";

/** What the provider is sent: inline bytes, or short-lived signed links of tenant-folder copies. */
export async function providerInput(
  db: Pick<SupabaseRest, "download" | "upload" | "sign">,
  run: VideoRun,
  item: RunItem,
  provider: LipsyncProvider,
  {
    picture,
    voice,
    line,
    speaker,
    motionPrompt,
    durationS,
    aspect,
  }: {
    picture: MediaAsset;
    voice: MediaAsset;
    line: string;
    speaker: string | null;
    motionPrompt: string | null | undefined;
    durationS: number;
    aspect: string;
  },
) {
  const audioBytes = await readMedia(db, run.tenant_id, voice.url, BUCKET);
  const input: MediaInput = {
    prompt: `${speaker || "The character"} speaks this exact audio line to the camera with natural lip sync: "${line}". No text, no letters, no logos.`,
    line,
    motionPrompt,
    durationS,
    aspect,
    audioBytes,
  };
  if (provider.needs === "image") {
    input.imageBytes = await readMedia(db, run.tenant_id, picture.url, BUCKET);
  }
  if (provider.needsPublicMedia) {
    // Stored files are private: hand the provider fresh signed links of copies in the tenant folder.
    const base = `${item.folder}/${safeSegment(run.scene_id)}`;
    // Named by its real type: a provider may read the format from the link.
    const audioType = audioMime(audioBytes);
    const audioPath = assertTenantPath(
      run.tenant_id,
      `${base}/lipsync-audio-${safeSegment(run.id)}.${audioType === "audio/wav" ? "wav" : "mp3"}`,
    );
    await db.upload(BUCKET, audioPath, audioBytes, audioType);
    input.audioUrl = await db.sign(BUCKET, audioPath, 3600);
    if (provider.needs === "video") {
      // A clip in the tenant folder, or the user's own video in the private bucket it was kept in.
      const clip = storedObject(picture.url, BUCKET) ?? {
        bucket: BUCKET,
        path: picture.url,
      };
      input.videoUrl = await db.sign(
        clip.bucket,
        assertTenantPath(run.tenant_id, clip.path),
        3600,
      );
    } else {
      // A provider that needs no clip takes the still, read above.
      if (!input.imageBytes) {
        throw finalError(`${provider.name} lip sync: the still was not read`);
      }
      const copy = await publicStill(input.imageBytes);
      const imagePath = assertTenantPath(
        run.tenant_id,
        `${base}/lipsync-still-${safeSegment(run.id)}.${copy.ext}`,
      );
      await db.upload(BUCKET, imagePath, copy.bytes, copy.contentType);
      input.imageUrl = await db.sign(BUCKET, imagePath, 3600);
    }
  }
  return input;
}
