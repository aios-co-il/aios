import { finalError, loadRunItem, loadRunScene } from "../guard.ts";
import { isTalkingScene, spokenLine, talkingLine } from "../narration.ts";
import { SPEECH_MODEL } from "../providers/elevenlabsSound.ts";
import { BUCKET, alreadyGenerated, assetPath } from "./audio-store.ts";
import { vocalizeForSpeech } from "./vocalize.ts";
import { narrationLines, newTake } from "./voice-take.ts";

/** ElevenLabs multilingual TTS list price; matches the studio's estimate. */
const VOICE_USD_PER_1000_CHARS = 0.12;

/** Speaks the storyboard as one continuous narration, or one scene for an older voice run. */
export async function generateVoice({
  db,
  run,
  apiKey,
  googleKey = null,
  resolveOpenRouterKey = async () => null,
  vocalize = vocalizeForSpeech,
  log = console.log,
  submitting,
}) {
  const continuous = run.input?.continuous === true || !run.scene_id;
  const item = await loadRunItem(db, run);
  // The text comes from the scene rows, so the voice matches what the storyboard shows.
  const spoken = continuous ? await narrationLines(db, run) : null;
  const scene = continuous
    ? null
    : await loadRunScene(db, run, "id,voiceover_text,meta");
  // A talking scene's own line (its dialogue) is what its lip-sync pass needs.
  const text = continuous
    ? spoken.text
    : isTalkingScene(scene)
      ? talkingLine(scene)
      : spokenLine(scene.voiceover_text);
  if (!text) throw finalError("voice run: voiceover_text is required");
  const path = assetPath(
    run,
    item.folder,
    "voice",
    continuous ? "narration" : "music",
  ).replace(/\.mp3$/, ".audio");
  const meta = alreadyGenerated(run, path)
    ? (run.output.audio_meta ?? {})
    : await newTake({
        db,
        run,
        path,
        submitting,
        script: text,
        vocalize,
        engines: { apiKey, googleKey, resolveOpenRouterKey },
        log,
      });
  const provider = meta.provider || "elevenlabs";
  const model = meta.model || SPEECH_MODEL();
  if (continuous) {
    await db.rpc("attach_video_narration", {
      p_item_id: run.item_id,
      p_url: path,
      p_meta: {
        bucket: BUCKET,
        path,
        provider,
        model,
        voice_id: meta.voice_id ?? null,
        alignment: meta.alignment ?? null,
        continuous: true,
        // The whole script, so a later produce does not pay for the same narration again.
        text,
        lines: spoken.lines,
        // The tenant pronunciations this take used (workshop_narration_take compares them).
        pronunciations: meta.pronunciations ?? {},
      },
      p_run_id: run.id,
      p_lines: spoken.lines,
    });
  } else {
    await db.rpc("attach_video_scene_asset", {
      p_scene_id: run.scene_id,
      p_kind: "voice",
      p_url: path,
      p_meta: {
        bucket: BUCKET,
        path,
        provider,
        model,
        voice_id: meta.voice_id ?? null,
        alignment: meta.alignment ?? null,
        // The storyboard compares this with the scene text to skip unchanged voiceovers.
        text,
      },
      p_run_id: run.id,
    });
  }
  log(`[voice] ${run.id} stored ${path}`);
  return {
    // The worker finishes the run with the run it claimed plus this output, so the take's
    // metadata (nikud, billed characters) rides here too; the intermediate save above does not
    // reach the claimed run.
    output: {
      path,
      provider,
      voice_id: meta.voice_id ?? null,
      audio_path: path,
      audio_meta: meta,
    },
    provider,
    credits: 0,
    // ElevenLabs bills characters (meta.characters: what it counted for the pointed text; the
    // script's length only for audio made before that was recorded). Gemini's price comes from
    // its token counts; OpenRouter's is what it charged when its generation record had the price.
    costUsd:
      provider === "gemini" || provider === "openrouter"
        ? Number(meta.cost_usd) || 0
        : Math.round(
            ((Number(meta.characters) || text.length) / 1000) *
              VOICE_USD_PER_1000_CHARS *
              10000,
          ) / 10000,
  };
}

/** The music job lives in music.ts; the worker loop imports both sound jobs from here. */
export { generateMusic } from "./music.ts";
