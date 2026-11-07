/**
 * Where a sound run's audio is stored, and the guard that pays the provider at most once per run
 * (sound.ts voice, music.ts bed).
 */

import { assertTenantPath, finalError, safeSegment } from "../guard.ts";

export const BUCKET = "creative-video";

/** <item folder>/<scene or music>/<kind>-<run>.mp3: one file per run, stable across retries. */
export const assetPath = (run, folder, kind, fallback = "music") =>
  assertTenantPath(
    run.tenant_id,
    `${folder}/${safeSegment(run.scene_id, fallback)}/${kind}-${safeSegment(run.id)}.mp3`,
  );

/**
 * Pays the provider at most once per run. The audio is stored and its path recorded on the
 * run before anything else can fail, so a retry reuses it. A failure after the provider
 * charged but before the upload is final rather than retried.
 */
export async function generateOnce({
  db,
  run,
  path,
  generate,
  submitting = (work) => work(),
}) {
  if (alreadyGenerated(run, path)) {
    return run.output.audio_meta ?? {};
  }
  // The paid call and the save of its file run inside the worker's submit guard, so a stop
  // never puts the run back to queued between the payment and the save (src/inflight.ts).
  return submitting(() => generateAndStore({ db, run, path, generate }));
}

/** Makes the audio, stores its file and records its path on the run. */
async function generateAndStore({ db, run, path, generate }) {
  const result = await generate();
  try {
    await db.upload(
      BUCKET,
      path,
      result.bytes,
      result.contentType || "audio/mpeg",
    );
  } catch (error) {
    throw finalError(
      `audio was generated but could not be stored (${error instanceof Error ? error.message : error}); not retried to avoid paying again`,
    );
  }
  const meta = result.meta ?? {};
  try {
    await db.update("marketing_runs", `id=eq.${run.id}`, {
      output: { ...(run.output ?? {}), audio_path: path, audio_meta: meta },
    });
  } catch (error) {
    throw finalError(
      `audio was stored at ${path} but the run could not record it (${error instanceof Error ? error.message : error}); not retried to avoid paying again`,
    );
  }
  return meta;
}

/** True when an earlier attempt of this run already stored its audio at `path`. */
export const alreadyGenerated = (run, path) => run.output?.audio_path === path;
