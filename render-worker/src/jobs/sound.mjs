import {
  composeMusic,
  synthesizeSpeech,
} from "../providers/elevenlabsSound.mjs";

const BUCKET = "creative-video";

const assetPath = (run, kind, extension) =>
  `${run.tenant_id}/${run.input?.client_id ?? "general"}/${run.item_id}/${run.scene_id ?? "music"}/${kind}-v${(run.attempts ?? 0) + 1}.${extension}`;

/** Speaks one scene's voiceover and stores the mp3 plus word timestamps. */
export async function generateVoice({ db, run, apiKey, log = console.log }) {
  const text = String(run.input?.voiceover_text ?? "").trim();
  if (!run.scene_id || !text)
    throw new Error("voice run: scene_id and voiceover_text are required");
  const speech = await synthesizeSpeech({
    apiKey,
    voiceId: run.input?.voice_id || null,
    text,
  });
  const path = assetPath(run, "voice", "mp3");
  await db.upload(BUCKET, path, speech.bytes, "audio/mpeg");
  await db.rpc("attach_video_scene_asset", {
    p_scene_id: run.scene_id,
    p_kind: "voice",
    p_url: path,
    p_meta: {
      bucket: BUCKET,
      path,
      provider: "elevenlabs",
      model: "eleven_v4",
      voice_id: speech.voiceId,
      alignment: speech.alignment,
    },
    p_run_id: run.id,
  });
  log(`[voice] ${run.id} stored ${path}`);
  return {
    output: { path, provider: "elevenlabs", voice_id: speech.voiceId },
    provider: "elevenlabs",
    credits: 0,
    costUsd: Number(run.input?.estimate?.usd) || 0,
  };
}

/** One music bed for the whole storyboard. */
export async function generateMusic({ db, run, apiKey, log = console.log }) {
  const prompt = String(run.input?.prompt ?? "").trim();
  const musicLengthMs = Number(run.input?.music_length_ms);
  if (!prompt || !musicLengthMs)
    throw new Error("music run: prompt and music_length_ms are required");
  const bytes = await composeMusic({ apiKey, prompt, musicLengthMs });
  const path = assetPath(run, "music", "mp3");
  await db.upload(BUCKET, path, bytes, "audio/mpeg");
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
      model: "music_v2_5",
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
