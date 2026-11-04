/** Waits for the provider's lip-sync job and stores its clip as the scene's clip. */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probe } from "../ffmpeg.ts";
import { assertTenantPath, finalError, safeSegment } from "../guard.ts";

export const BUCKET = "creative-video";
const POLL_EVERY_MS = () => Number(process.env.CLIP_POLL_MS) || 10_000;
const TIMEOUT_MS = () => Number(process.env.CLIP_TIMEOUT_MS) || 15 * 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function finishLipsync({
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
