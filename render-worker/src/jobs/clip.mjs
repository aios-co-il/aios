import {
  assertTenantPath,
  finalError,
  loadRunItem,
  loadRunScene,
  readMedia,
  safeSegment,
} from "../guard.mjs";
import { speaksInChosenVoice, talkingLine } from "../narration.mjs";
import {
  clipPrompt,
  getVideoProvider,
  talkingPrompt,
} from "../providers/index.mjs";
import { publicStill } from "./still-image.mjs";

const BUCKET = "creative-video";
const POLL_EVERY_MS = () => Number(process.env.CLIP_POLL_MS) || 10_000;
const TIMEOUT_MS = () => Number(process.env.CLIP_TIMEOUT_MS) || 15 * 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** <item folder>/<scene>/clip-v<n>.mp4, n = the next clip version of the scene. */
export async function clipPath(db, run, folder) {
  const rows = await db.select(
    "marketing_assets",
    `item_id=eq.${run.item_id}&type=eq.video_clip&meta->>scene_id=eq.${run.scene_id}&select=id`,
  );
  const version = (rows?.length ?? 0) + 1;
  return assertTenantPath(
    run.tenant_id,
    `${folder}/${safeSegment(run.scene_id)}/clip-v${version}.mp4`,
  );
}

/**
 * Animates one approved still into a clip with the configured video provider, stores the
 * MP4 in creative-video and makes it the scene's current clip. A retried run that already
 * has a provider job resumes polling instead of paying for a second generation.
 * The still comes from the scene row, not from run.input, which tenant members can write.
 */
export async function generateClip({
  db,
  run,
  provider = getVideoProvider(),
  fallbackFrom = null,
  log = console.log,
  // The worker wraps the paid submit and the save of its job id, so a stop never requeues
  // the run in between (src/inflight.mjs).
  submitting = (submit) => submit(),
}) {
  const input = run.input ?? {};
  if (!run.scene_id) throw finalError("clip run: scene_id is required");
  const item = await loadRunItem(db, run);
  const scene = await loadRunScene(
    db,
    run,
    "id,still_asset_id,voiceover_text,meta",
  );
  // A talking scene on an engine that speaks (Veo 3.1, Seedance 2.5) is made in one pass:
  // the line goes in the prompt and the clip carries the speech. Otherwise the clip is silent
  // and advance_video_production queues a separate lip-sync run for the scene. A line in the
  // chosen voice is never spoken by the engine (its voice would not be the chosen one).
  const line =
    provider.nativeSpeech &&
    process.env.LIPSYNC_NATIVE !== "0" &&
    !speaksInChosenVoice(scene)
      ? talkingLine(scene)
      : "";
  const talking = line
    ? { line, speaker: String(scene.meta?.speaker ?? "").trim() || null }
    : null;
  const [still] = scene.still_asset_id
    ? ((await db.select(
        "marketing_assets",
        `id=eq.${scene.still_asset_id}&tenant_id=eq.${run.tenant_id}&select=id,url`,
      )) ?? [])
    : [];
  if (!still?.url)
    throw finalError("clip run: the scene has no still (is required)");
  const durationS = Number(input.duration_s) || 5;
  const aspect = input.aspect || "9:16";
  const estimate = provider.estimate({ durationS, talking: Boolean(talking) });

  let jobId =
    run.provider === provider.name && provider.name !== "mock"
      ? run.provider_job_id
      : null;
  if (jobId) {
    log(`[clip] ${run.id} resumes ${provider.name} job ${jobId}`);
  } else {
    // A creative-video path, the user's own upload (workshop_edit_from_assets) or a media link.
    const imageBytes = await readMedia(db, run.tenant_id, still.url, BUCKET);
    let imageUrl = null;
    if (provider.needsPublicImage) {
      // Stored stills can be expiring signed links; hand the provider a fresh one of a copy,
      // labelled with its real type (a WebP becomes a PNG).
      const copy = await publicStill(imageBytes);
      const source = assertTenantPath(
        run.tenant_id,
        `${item.folder}/${safeSegment(run.scene_id)}/still-source-${safeSegment(run.id)}.${copy.ext}`,
      );
      await db.upload(BUCKET, source, copy.bytes, copy.contentType);
      imageUrl = await db.sign(BUCKET, source, 3600);
    }
    await submitting(async () => {
      ({ jobId } = await provider.submit({
        imageBytes,
        imageUrl,
        prompt: talking
          ? talkingPrompt(input.motion_prompt, talking)
          : clipPrompt(input.motion_prompt),
        durationS,
        aspect,
        generateAudio: Boolean(talking) || input.generate_audio === true,
        talking: Boolean(talking),
      }));
      try {
        await db.update("marketing_runs", `id=eq.${run.id}`, {
          provider: provider.name,
          provider_job_id: jobId,
        });
      } catch (error) {
        // The provider already accepted (and charges for) the job: never submit it again.
        throw submitted(
          finalError(
            `${provider.name} job ${jobId} was submitted but could not be saved (${error instanceof Error ? error.message : error}); not retried to avoid paying again`,
          ),
        );
      }
    });
    log(`[clip] ${run.id} submitted ${provider.name} job ${jobId}`);
  }
  try {
    return await finishClip({
      db,
      run,
      provider,
      jobId,
      item,
      still,
      durationS,
      aspect,
      estimate,
      fallbackFrom,
      talking,
      log,
    });
  } catch (error) {
    throw submitted(error);
  }
}

/**
 * Marks an error raised once the provider holds a job: that job may be charged, so the run
 * must not switch to another engine and pay twice.
 */
function submitted(error) {
  const tagged = error instanceof Error ? error : new Error(String(error));
  tagged.submitted = true;
  return tagged;
}

async function finishClip({
  db,
  run,
  provider,
  jobId,
  item,
  still,
  durationS,
  aspect,
  estimate,
  fallbackFrom,
  talking = null,
  log,
}) {
  const deadline = Date.now() + TIMEOUT_MS();
  let result = await provider.poll(jobId);
  while (result.status === "pending") {
    if (Date.now() > deadline)
      throw new Error(`${provider.name} job ${jobId} timed out`);
    await sleep(POLL_EVERY_MS());
    result = await provider.poll(jobId);
  }
  // A paid job that failed stays failed: a retry would poll the same dead job. The free
  // preview makes a new clip on retry, so its failure may be retried.
  if (result.status !== "succeeded") {
    const message = result.error || `${provider.name} job ${jobId} failed`;
    throw provider.name === "mock" ? new Error(message) : finalError(message);
  }

  // The provider's own charge when it reports one (OpenRouter), else the estimate.
  const costUsd = Number.isFinite(result.costUsd)
    ? result.costUsd
    : estimate.usd;
  let bytes = result.bytes;
  if (!bytes) {
    const response = await fetch(result.url);
    if (!response.ok)
      throw new Error(
        `clip download ${response.status} (job ${jobId} kept for retry)`,
      );
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  const path = await clipPath(db, run, item.folder);
  const model = (talking && provider.talkingModel) || provider.model;
  await db.upload(BUCKET, path, bytes, "video/mp4");
  await db.rpc("attach_video_scene_asset", {
    p_scene_id: run.scene_id,
    p_kind: "clip",
    p_url: path,
    p_meta: {
      bucket: BUCKET,
      path,
      provider: provider.name,
      model,
      provider_job_id: jobId,
      duration_s: durationS,
      aspect,
      source_still_asset_id: still.id,
      generation_cost: { usd: costUsd, credits: estimate.credits },
      ...(fallbackFrom ? { fallback_from: fallbackFrom } : {}),
      // The clip speaks the scene's line itself; no lip-sync pass is needed.
      ...(talking
        ? {
            lipsync: true,
            native_speech: true,
            dialogue: talking.line,
            speaker: talking.speaker,
          }
        : {}),
    },
    p_run_id: run.id,
  });
  log(`[clip] ${run.id} stored ${path}`);
  return {
    output: {
      path,
      provider: provider.name,
      model,
      job_id: jobId,
      ...(talking ? { lipsync: true } : {}),
      ...(fallbackFrom ? { fallback_from: fallbackFrom } : {}),
    },
    costUsd,
    credits: estimate.credits,
    provider: provider.name,
  };
}

/** Called once a clip run will not be retried: the scene shows as failed in the strip. */
export async function failClip({ db, run }) {
  if (!run.scene_id) return;
  await db.update(
    "marketing_video_scenes",
    `id=eq.${run.scene_id}&tenant_id=eq.${run.tenant_id}&status=eq.clip_generating`,
    { status: "failed" },
  );
}
