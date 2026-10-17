import {
  assertMediaUrl,
  assertTenantPath,
  finalError,
  loadRunItem,
  loadRunScene,
  safeSegment,
} from "../guard.mjs";
import { clipPrompt, getVideoProvider } from "../providers/index.mjs";

const BUCKET = "creative-video";
const POLL_EVERY_MS = () => Number(process.env.CLIP_POLL_MS) || 10_000;
const TIMEOUT_MS = () => Number(process.env.CLIP_TIMEOUT_MS) || 15 * 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Still bytes from a creative-video path in the tenant folder, or an allowed media URL. */
async function loadStill(db, tenantId, url) {
  if (/^https?:\/\//.test(url)) {
    const response = await fetch(assertMediaUrl(url));
    if (!response.ok)
      throw new Error(
        `still download ${response.status}: ${url.slice(0, 200)}`,
      );
    return new Uint8Array(await response.arrayBuffer());
  }
  return db.download(BUCKET, assertTenantPath(tenantId, url));
}

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
  log = console.log,
}) {
  const input = run.input ?? {};
  if (!run.scene_id) throw finalError("clip run: scene_id is required");
  const item = await loadRunItem(db, run);
  const scene = await loadRunScene(db, run, "id,still_asset_id");
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
  const estimate = provider.estimate({ durationS });

  let jobId =
    run.provider === provider.name && provider.name !== "mock"
      ? run.provider_job_id
      : null;
  if (jobId) {
    log(`[clip] ${run.id} resumes ${provider.name} job ${jobId}`);
  } else {
    const imageBytes = await loadStill(db, run.tenant_id, still.url);
    let imageUrl = null;
    if (provider.needsPublicImage) {
      // Stored stills can be expiring signed links; hand the provider a fresh one of a copy.
      const source = assertTenantPath(
        run.tenant_id,
        `${item.folder}/${safeSegment(run.scene_id)}/still-source-${safeSegment(run.id)}.png`,
      );
      await db.upload(BUCKET, source, imageBytes, "image/png");
      imageUrl = await db.sign(BUCKET, source, 3600);
    }
    ({ jobId } = await provider.submit({
      imageBytes,
      imageUrl,
      prompt: clipPrompt(input.motion_prompt),
      durationS,
      aspect,
      generateAudio: input.generate_audio === true,
    }));
    try {
      await db.update("marketing_runs", `id=eq.${run.id}`, {
        provider: provider.name,
        provider_job_id: jobId,
      });
    } catch (error) {
      // The provider already accepted (and charges for) the job: never submit it again.
      throw finalError(
        `${provider.name} job ${jobId} was submitted but could not be saved (${error instanceof Error ? error.message : error}); not retried to avoid paying again`,
      );
    }
    log(`[clip] ${run.id} submitted ${provider.name} job ${jobId}`);
  }

  const deadline = Date.now() + TIMEOUT_MS();
  let result = await provider.poll(jobId);
  while (result.status === "pending") {
    if (Date.now() > deadline)
      throw new Error(`${provider.name} job ${jobId} timed out`);
    await sleep(POLL_EVERY_MS());
    result = await provider.poll(jobId);
  }
  if (result.status !== "succeeded")
    throw new Error(result.error || `${provider.name} job ${jobId} failed`);

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
  await db.upload(BUCKET, path, bytes, "video/mp4");
  await db.rpc("attach_video_scene_asset", {
    p_scene_id: run.scene_id,
    p_kind: "clip",
    p_url: path,
    p_meta: {
      bucket: BUCKET,
      path,
      provider: provider.name,
      model: provider.model,
      provider_job_id: jobId,
      duration_s: durationS,
      aspect,
      source_still_asset_id: still.id,
      generation_cost: { usd: estimate.usd, credits: estimate.credits },
    },
    p_run_id: run.id,
  });
  log(`[clip] ${run.id} stored ${path}`);
  return {
    output: {
      path,
      provider: provider.name,
      model: provider.model,
      job_id: jobId,
    },
    costUsd: estimate.usd,
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
