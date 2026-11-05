/** Submits the lip sync to the first provider that can take it, and saves its job id on the run. */
import {
  assertTenantPath,
  finalError,
  readMedia,
  safeSegment,
  storedObject,
} from "../guard.ts";
import { audioMime } from "../providers/lipsync.ts";
import { isPaidPlanError } from "../providers/plan.ts";
import type { MediaInput } from "../providers/types.ts";
import { BUCKET } from "./lipsync-finish.ts";
import { publicStill } from "./still-image.ts";

export const NO_LIPSYNC_PROVIDER =
  "lipsync run: no lip-sync provider is connected (is required): connect an ElevenLabs key (paid plan), a Kling key pair, an OpenRouter key or a Higgsfield key to the tenant";

/**
 * Tries the providers in order: the first that accepts the job is used. Returns the provider,
 * its job id and the picture it animates.
 */
export async function submitLipsync({
  db,
  run,
  item,
  names,
  providerFor,
  keys,
  scene,
  still,
  clip,
  motion,
  voice,
  line,
  durationS,
  aspect,
  log,
}) {
  let provider = null;
  let jobId = null;
  let source = null;
  let lastError = null;
  for (const name of names) {
    const candidate = providerFor(name, keys);
    // A clip-based lip sync re-times the mouth of the clip with the movement in it.
    const picture = candidate.needs === "video" ? (motion ?? clip) : still;
    if (!picture) {
      lastError = new Error(
        `${name} lip sync needs the scene ${candidate.needs === "video" ? "clip" : "still"}`,
      );
      continue;
    }
    try {
      const input = await providerInput(db, run, item, candidate, {
        picture,
        voice,
        line,
        speaker: String(scene.meta?.speaker ?? "").trim() || null,
        motionPrompt: scene.motion_prompt,
        durationS,
        aspect,
      });
      ({ jobId } = await candidate.submit(input));
      provider = candidate;
      source = {
        kind: candidate.needs === "video" ? "clip" : "still",
        asset_id: picture.id,
      };
      break;
    } catch (error) {
      lastError = error;
      // Only a plan that cannot make video, or a rejected key, moves on to the next provider;
      // nothing was accepted, so nothing was charged.
      if (
        !isPaidPlanError(error) &&
        !/\b40[13]\b|invalid credentials|model_access_denied/i.test(
          String(messageOf(error)),
        )
      )
        throw error;
      log(
        `[lipsync] ${run.id} ${name} unavailable: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  if (!provider)
    throw finalError(
      `lipsync run: ${lastError?.message ?? NO_LIPSYNC_PROVIDER}`,
    );
  try {
    await db.update("marketing_runs", `id=eq.${run.id}`, {
      provider: provider.name,
      provider_job_id: jobId,
      output: { ...(run.output ?? {}), lipsync_source: source },
    });
  } catch (error) {
    throw finalError(
      `${provider.name} lip-sync job ${jobId} was submitted but could not be saved (${error instanceof Error ? error.message : error}); not retried to avoid paying again`,
    );
  }
  return { provider, jobId, source };
}

/** What the provider is sent: inline bytes, or short-lived signed links of tenant-folder copies. */
async function providerInput(
  db,
  run,
  item,
  provider,
  { picture, voice, line, speaker, motionPrompt, durationS, aspect },
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
  if (provider.needs === "image")
    input.imageBytes = await readMedia(db, run.tenant_id, picture.url, BUCKET);
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

/** `error.message` when `error` is an object, as `error?.message` read it; else undefined. */
function messageOf(error: unknown): unknown {
  return typeof error === "object" && error !== null
    ? Reflect.get(error, "message")
    : undefined;
}
