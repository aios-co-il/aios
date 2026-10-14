import {
  assertTenantPath,
  finalError,
  loadRunItem,
  loadRunScene,
  safeSegment,
} from "../guard.mjs";
import {
  MUSIC_MODEL,
  SPEECH_MODEL,
  composeMusic,
  synthesizeSpeech,
} from "../providers/elevenlabsSound.mjs";

const BUCKET = "creative-video";

/** <item folder>/<scene or music>/<kind>-<run>.mp3: one file per run, stable across retries. */
const assetPath = (run, folder, kind) =>
  assertTenantPath(
    run.tenant_id,
    `${folder}/${safeSegment(run.scene_id, "music")}/${kind}-${safeSegment(run.id)}.mp3`,
  );

/**
 * Pays the provider at most once per run. The audio is stored and its path recorded on the
 * run before anything else can fail, so a retry reuses it. A failure after the provider
 * charged but before the upload is final rather than retried.
 */
async function generateOnce({ db, run, path, generate }) {
  if (run.output?.audio_path === path) return run.output.audio_meta ?? {};
  const result = await generate();
  try {
    await db.upload(BUCKET, path, result.bytes, "audio/mpeg");
  } catch (error) {
    throw finalError(
      `audio was generated but could not be stored (${error instanceof Error ? error.message : error}); not retried to avoid paying again`,
    );
  }
  const meta = result.meta ?? {};
  await db.update("marketing_runs", `id=eq.${run.id}`, {
    output: { ...(run.output ?? {}), audio_path: path, audio_meta: meta },
  });
  return meta;
}

/** Speaks one scene's voiceover and stores the mp3 plus word timestamps. */
export async function generateVoice({ db, run, apiKey, log = console.log }) {
  if (!run.scene_id) throw finalError("voice run: scene_id is required");
  const item = await loadRunItem(db, run);
  // The text comes from the scene row, so the voice matches what the storyboard shows.
  const scene = await loadRunScene(db, run, "id,voiceover_text");
  const text = String(scene.voiceover_text ?? "").trim();
  if (!text) throw finalError("voice run: voiceover_text is required");
  const path = assetPath(run, item.folder, "voice");
  const meta = await generateOnce({
    db,
    run,
    path,
    generate: async () => {
      const speech = await synthesizeSpeech({
        apiKey,
        voiceId: run.input?.voice_id || null,
        text,
      });
      return {
        bytes: speech.bytes,
        meta: { voice_id: speech.voiceId, alignment: speech.alignment },
      };
    },
  });
  await db.rpc("attach_video_scene_asset", {
    p_scene_id: run.scene_id,
    p_kind: "voice",
    p_url: path,
    p_meta: {
      bucket: BUCKET,
      path,
      provider: "elevenlabs",
      model: SPEECH_MODEL(),
      voice_id: meta.voice_id ?? null,
      alignment: meta.alignment ?? null,
      // The storyboard compares this with the scene text to skip unchanged voiceovers.
      text,
    },
    p_run_id: run.id,
  });
  log(`[voice] ${run.id} stored ${path}`);
  return {
    output: { path, provider: "elevenlabs", voice_id: meta.voice_id ?? null },
    provider: "elevenlabs",
    credits: 0,
    // The approved estimate; ElevenLabs bills characters, not a returned price.
    costUsd: Number(run.input?.estimate?.usd) || 0,
  };
}

/** One music bed for the whole storyboard. */
export async function generateMusic({ db, run, apiKey, log = console.log }) {
  const item = await loadRunItem(db, run);
  const prompt = String(run.input?.prompt ?? "").trim();
  const musicLengthMs = Math.min(
    300_000,
    Math.max(3_000, Number(run.input?.music_length_ms) || 0),
  );
  if (!prompt || !Number(run.input?.music_length_ms))
    throw finalError("music run: prompt and music_length_ms are required");
  const path = assetPath(run, item.folder, "music");
  await generateOnce({
    db,
    run,
    path,
    generate: async () => ({
      bytes: await composeMusic({ apiKey, prompt, musicLengthMs }),
    }),
  });
  const existing = await db.select(
    "marketing_assets",
    `run_id=eq.${run.id}&type=eq.music&select=id`,
  );
  if (!existing?.length)
    await db.insert("marketing_assets", {
      tenant_id: run.tenant_id,
      item_id: run.item_id,
      run_id: run.id,
      stage_id: run.stage_id,
      type: "music",
      url: path,
      meta: {
        bucket: BUCKET,
        path,
        provider: "elevenlabs",
        model: MUSIC_MODEL(),
        music_length_ms: musicLengthMs,
      },
    });
  log(`[music] ${run.id} stored ${path}`);
  return {
    output: { path, provider: "elevenlabs" },
    provider: "elevenlabs",
    credits: 0,
    costUsd: Number(run.input?.estimate?.usd) || 0,
  };
}
