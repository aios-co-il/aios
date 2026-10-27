import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probe } from "../ffmpeg.mjs";
import {
  assertMediaUrl,
  assertTenantPath,
  finalError,
  loadRunItem,
  loadRunScene,
  safeSegment,
} from "../guard.mjs";
import {
  isTalkingScene,
  speaksInChosenVoice,
  talkingLine,
} from "../narration.mjs";
import {
  getLipsyncProvider,
  lipsyncProviderNames,
} from "../providers/index.mjs";
import { audioMime } from "../providers/lipsync.mjs";
import { isPaidPlanError } from "../providers/plan.mjs";
import { publicStill } from "./still-image.mjs";

const BUCKET = "creative-video";
const POLL_EVERY_MS = () => Number(process.env.CLIP_POLL_MS) || 10_000;
const TIMEOUT_MS = () => Number(process.env.CLIP_TIMEOUT_MS) || 15 * 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const NO_LIPSYNC_PROVIDER =
  "lipsync run: no lip-sync provider is connected (is required): connect an ElevenLabs key (paid plan), an OpenRouter key or a Higgsfield key to the tenant, or set KLING_ACCESS_KEY and KLING_SECRET_KEY on the worker";

/** Bytes of a creative-video file in the tenant folder, or of an allowed media URL. */
async function loadFile(db, tenantId, url) {
  if (/^https?:\/\//.test(String(url))) {
    const response = await fetch(assertMediaUrl(url));
    if (!response.ok)
      throw new Error(
        `media download ${response.status}: ${String(url).slice(0, 200)}`,
      );
    return new Uint8Array(await response.arrayBuffer());
  }
  return db.download(BUCKET, assertTenantPath(tenantId, url));
}

/** <item folder>/<scene>/lipsync-v<n>.mp4, n = the next lip-synced clip of the scene. */
export async function lipsyncPath(db, run, folder) {
  const rows = await db.select(
    "marketing_assets",
    `item_id=eq.${run.item_id}&tenant_id=eq.${run.tenant_id}&type=eq.video_clip&meta->>scene_id=eq.${run.scene_id}&meta->>lipsync=eq.true&select=id`,
  );
  return assertTenantPath(
    run.tenant_id,
    `${folder}/${safeSegment(run.scene_id)}/lipsync-v${(rows?.length ?? 0) + 1}.mp4`,
  );
}

const asset = async (db, run, id, type) => {
  if (!id) return null;
  const [row] =
    (await db.select(
      "marketing_assets",
      `id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&type=eq.${type}&select=id,url,meta`,
    )) ?? [];
  return row?.url ? row : null;
};

/**
 * The scene's animated clip, which carries its own movement (motion_prompt): the current clip, or
 * the one an earlier lip sync of the scene was made over, so a new line keeps the movement. A clip
 * that talks (a one-shot talking clip, or a lip sync with no clip behind it) has none to keep.
 */
export async function motionClipOf(db, run, clip) {
  if (!clip) return null;
  if (clip.meta?.lipsync !== true) return clip;
  const id =
    clip.meta?.motion_clip_asset_id ||
    (clip.meta?.source_kind === "clip" ? clip.meta?.source_asset_id : null);
  const earlier = await asset(db, run, id, "video_clip");
  return earlier && earlier.meta?.lipsync !== true ? earlier : null;
}

/** Length of the stored MP4, so the film gives the whole line its time. null without ffprobe. */
async function videoSeconds(bytes) {
  const dir = await mkdtemp(join(tmpdir(), "lipsync-"));
  try {
    const file = join(dir, "clip.mp4");
    await writeFile(file, bytes);
    const { duration } = await probe(file);
    return duration > 0 ? Math.round(duration * 100) / 100 : null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const submitted = (error) => {
  const tagged = error instanceof Error ? error : new Error(String(error));
  tagged.submitted = true;
  return tagged;
};

/**
 * Makes a talking scene's character mouth its own voice line. Reads the scene, its voice
 * (a per-scene voiceover of exactly this line), still and clip from the database for the
 * run's tenant, never from run.input. The provider job id is stored before polling, so a
 * retried run resumes the same job and is charged once. The result becomes the scene clip.
 */
export async function generateLipsync({
  db,
  run,
  keys = {},
  providerFor = getLipsyncProvider,
  env = process.env,
  log = console.log,
  // Wraps the paid submit and the save of its job id (src/inflight.mjs).
  submitting = (submit) => submit(),
}) {
  if (!run.scene_id) throw finalError("lipsync run: scene_id is required");
  const item = await loadRunItem(db, run);
  const scene = await loadRunScene(
    db,
    run,
    "id,still_asset_id,clip_asset_id,voice_asset_id,voiceover_text,duration_s,meta",
  );
  if (!isTalkingScene(scene))
    throw finalError(
      "lipsync run: the scene is not marked lipsync (is required)",
    );
  const line = talkingLine(scene);
  if (!line)
    throw finalError(
      "lipsync run: the scene has no line to speak (is required)",
    );
  const voice = await asset(db, run, scene.voice_asset_id, "voiceover");
  if (!voice || String(voice.meta?.text ?? "") !== line)
    throw finalError(
      "lipsync run: the scene's own voice line is missing (is required)",
    );
  const still = await asset(db, run, scene.still_asset_id, "video_still");
  const clip = await asset(db, run, scene.clip_asset_id, "video_clip");
  const motion = await motionClipOf(db, run, clip);

  // OpenRouter Veo speaks the line in its own voice: never for a line in the chosen voice,
  // which is assembled as it is (the chosen voice over the picture) when nothing else can.
  const names = lipsyncProviderNames(run, keys, env).filter(
    (name) => !(name === "openrouter" && speaksInChosenVoice(scene)),
  );
  if (!names.length) throw finalError(NO_LIPSYNC_PROVIDER);
  const durationS = Number(scene.duration_s) || 5;
  const aspect = run.input?.aspect || clip?.meta?.aspect || "9:16";

  let provider = null;
  let jobId = null;
  let source = null;
  if (run.provider_job_id && names.length === 1 && run.provider === names[0]) {
    provider = providerFor(names[0], keys);
    jobId = run.provider_job_id;
    source = run.output?.lipsync_source ?? null;
    log(`[lipsync] ${run.id} resumes ${provider.name} job ${jobId}`);
  } else {
    await submitting(async () => {
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
              String(error?.message),
            )
          )
            throw error;
          log(`[lipsync] ${run.id} ${name} unavailable: ${error.message}`);
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
    });
    log(`[lipsync] ${run.id} submitted ${provider.name} job ${jobId}`);
  }

  try {
    return await finishLipsync({
      db,
      run,
      item,
      provider,
      jobId,
      line,
      scene,
      voice,
      source,
      // A lip sync of the still has none of the scene's movement: the film plays the animated
      // clip after the line (workshop-manifest.mjs), so each skin still makes her own move.
      motionClipId:
        source?.kind === "still" && motion?.id && motion.id !== source.asset_id
          ? motion.id
          : null,
      durationS,
      aspect,
      log,
    });
  } catch (error) {
    throw submitted(error);
  }
}

/** What the provider is sent: inline bytes, or short-lived signed links of tenant-folder copies. */
async function providerInput(
  db,
  run,
  item,
  provider,
  { picture, voice, line, speaker, durationS, aspect },
) {
  const audioBytes = await loadFile(db, run.tenant_id, voice.url);
  const input = {
    prompt: `${speaker || "The character"} speaks this exact audio line to the camera with natural lip sync: "${line}". No text, no letters, no logos.`,
    durationS,
    aspect,
    audioBytes,
  };
  if (provider.needs === "image")
    input.imageBytes = await loadFile(db, run.tenant_id, picture.url);
  if (provider.needsPublicMedia) {
    // Stored files are private: hand the provider fresh signed links of copies in the tenant folder.
    const base = `${item.folder}/${safeSegment(run.scene_id)}`;
    const audioPath = assertTenantPath(
      run.tenant_id,
      `${base}/lipsync-audio-${safeSegment(run.id)}.audio`,
    );
    await db.upload(BUCKET, audioPath, audioBytes, audioMime(audioBytes));
    input.audioUrl = await db.sign(BUCKET, audioPath, 3600);
    if (provider.needs === "video") {
      input.videoUrl = await db.sign(
        BUCKET,
        assertTenantPath(run.tenant_id, picture.url),
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

async function finishLipsync({
  db,
  run,
  item,
  provider,
  jobId,
  line,
  scene,
  voice,
  source,
  motionClipId = null,
  durationS,
  aspect,
  log,
}) {
  const deadline = Date.now() + TIMEOUT_MS();
  let result = await provider.poll(jobId);
  while (result.status === "pending") {
    if (Date.now() > deadline)
      throw new Error(`${provider.name} lip-sync job ${jobId} timed out`);
    await sleep(POLL_EVERY_MS());
    result = await provider.poll(jobId);
  }
  if (result.status !== "succeeded")
    throw finalError(
      result.error || `${provider.name} lip-sync job ${jobId} failed`,
    );
  let bytes = result.bytes;
  if (!bytes) {
    const response = await fetch(result.url);
    if (!response.ok)
      throw new Error(
        `lipsync download ${response.status} (job ${jobId} kept for retry)`,
      );
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  const seconds = (await videoSeconds(bytes)) ?? durationS;
  // What the provider charged when it says (OpenRouter), else the planning price.
  const cost = Number.isFinite(result.costUsd)
    ? { usd: result.costUsd, credits: 0 }
    : provider.estimate({ durationS: seconds });
  const path = await lipsyncPath(db, run, item.folder);
  await db.upload(BUCKET, path, bytes, "video/mp4");
  await db.rpc("attach_video_scene_asset", {
    p_scene_id: run.scene_id,
    p_kind: "clip",
    p_url: path,
    p_meta: {
      bucket: BUCKET,
      path,
      lipsync: true,
      provider: provider.name,
      model: provider.model,
      provider_job_id: jobId,
      dialogue: line,
      speaker: String(scene.meta?.speaker ?? "").trim() || null,
      voice_asset_id: voice.id,
      source_kind: source?.kind ?? null,
      source_asset_id: source?.asset_id ?? null,
      ...(motionClipId ? { motion_clip_asset_id: motionClipId } : {}),
      duration_s: seconds,
      aspect,
      generation_cost: { usd: cost.usd, credits: cost.credits },
    },
    p_run_id: run.id,
  });
  log(`[lipsync] ${run.id} stored ${path}`);
  return {
    output: {
      path,
      provider: provider.name,
      model: provider.model,
      job_id: jobId,
      lipsync: true,
    },
    costUsd: cost.usd,
    credits: cost.credits,
    provider: provider.name,
  };
}
