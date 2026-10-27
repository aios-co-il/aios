import {
  assertTenantPath,
  finalError,
  loadRunItem,
  loadRunScene,
  safeSegment,
} from "../guard.mjs";
import {
  isTalkingScene,
  joinNarration,
  narrationLine,
  spokenLine,
  talkingLine,
} from "../narration.mjs";
import {
  MUSIC_MODEL,
  SPEECH_MODEL,
  composeMusic,
  synthesizeSpeech,
} from "../providers/elevenlabsSound.mjs";
import { synthesizeGeminiSpeech } from "../providers/geminiTts.mjs";
import { synthesizeOpenRouterSpeech } from "../providers/openrouterTts.mjs";
import { isPaidPlanError, isRejectedKeyError } from "../providers/plan.mjs";
import {
  MUSIC_MAX_MS,
  MUSIC_MIN_MS,
  musicCostUsd,
  musicLengthMs,
  quotedMusicMs,
} from "./music-length.mjs";

const BUCKET = "creative-video";
/** ElevenLabs multilingual TTS list price; matches the studio's estimate. */
const VOICE_USD_PER_1000_CHARS = 0.12;

/** <item folder>/<scene or music>/<kind>-<run>.mp3: one file per run, stable across retries. */
const assetPath = (run, folder, kind, fallback = "music") =>
  assertTenantPath(
    run.tenant_id,
    `${folder}/${safeSegment(run.scene_id, fallback)}/${kind}-${safeSegment(run.id)}.mp3`,
  );

/** Scenes this voice run speaks, in storyboard order. */
async function narrationLines(db, run) {
  const rows =
    (await db.select(
      "marketing_video_scenes",
      `item_id=eq.${run.item_id}&tenant_id=eq.${run.tenant_id}&select=id,voiceover_text,meta&order=position.asc`,
    )) ?? [];
  const wanted = new Set(
    Array.isArray(run.input?.scene_ids) ? run.input.scene_ids : [],
  );
  const lines = {};
  for (const row of rows) {
    if (wanted.size && !wanted.has(row.id)) continue;
    // A talking scene speaks from its own clip, never inside the narration.
    const text = narrationLine(row);
    if (text) lines[row.id] = text;
  }
  return { text: joinNarration(Object.values(lines)), lines };
}

/**
 * Pays the provider at most once per run. The audio is stored and its path recorded on the
 * run before anything else can fail, so a retry reuses it. A failure after the provider
 * charged but before the upload is final rather than retried.
 */
async function generateOnce({ db, run, path, generate }) {
  if (run.output?.audio_path === path) return run.output.audio_meta ?? {};
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

/** Speaks the storyboard as one continuous narration, or one scene for an older voice run. */
export async function generateVoice({
  db,
  run,
  apiKey,
  googleKey = null,
  resolveOpenRouterKey = async () => null,
  log = console.log,
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
  const meta = await generateOnce({
    db,
    run,
    path,
    generate: async () => {
      if (apiKey) {
        try {
          const speech = await synthesizeSpeech({
            apiKey,
            voiceId: run.input?.voice_id || null,
            text,
          });
          return {
            bytes: speech.bytes,
            contentType: "audio/mpeg",
            meta: {
              provider: "elevenlabs",
              model: SPEECH_MODEL(),
              voice_id: speech.voiceId,
              alignment: speech.alignment,
            },
          };
        } catch (error) {
          if (!isPaidPlanError(error) && !isRejectedKeyError(error))
            throw error;
          log(
            `[voice] ${run.id} ElevenLabs cannot narrate (${isPaidPlanError(error) ? "plan" : "key"}); trying OpenRouter, then Gemini`,
          );
        }
      }
      // A refused request is not billed, so the next route may still be tried.
      const openRouterKey = await resolveOpenRouterKey().catch(() => null);
      if (openRouterKey) {
        try {
          const speech = await synthesizeOpenRouterSpeech({
            apiKey: openRouterKey,
            voiceId: run.input?.voice_id || null,
            text,
          });
          return {
            bytes: speech.bytes,
            contentType: speech.contentType,
            meta: {
              provider: "openrouter",
              model: speech.model,
              voice_id: speech.voice,
              cost_usd: speech.costUsd,
              cost_reported: speech.costReported,
              generation_id: speech.generationId ?? null,
            },
          };
        } catch (error) {
          // A failure after OpenRouter charged is final; only a refused request moves on.
          if (error?.final || !googleKey) throw error;
          log(
            `[voice] ${run.id} OpenRouter speech failed (${error instanceof Error ? error.message : error}); using Gemini`,
          );
        }
      }
      if (!googleKey) {
        throw finalError(
          apiKey
            ? "קריינות ElevenLabs לא זמינה (תוכנית Pro או מפתח לא תקין), ואין מוח OpenRouter או מפתח Google לקריינות חלופית"
            : "אין מפתח לקריינות: חברו ElevenLabs, מוח OpenRouter או Google",
        );
      }
      const speech = await synthesizeGeminiSpeech({ apiKey: googleKey, text });
      return {
        bytes: speech.bytes,
        contentType: speech.contentType,
        meta: {
          provider: "gemini",
          model: speech.model,
          voice_id: speech.voice,
          cost_usd: speech.costUsd,
        },
      };
    },
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
    output: { path, provider, voice_id: meta.voice_id ?? null },
    provider,
    credits: 0,
    // ElevenLabs bills characters and returns no price; Gemini's comes from its token counts.
    // OpenRouter's is what it charged when its generation record had the price.
    costUsd:
      provider === "gemini" || provider === "openrouter"
        ? Number(meta.cost_usd) || 0
        : Math.round((text.length / 1000) * VOICE_USD_PER_1000_CHARS * 10000) /
          10000,
  };
}

/**
 * The bed's length. The run's music_length_ms is the storyboard's planned total; the bed is
 * sized to the film that will be rendered instead (music-length.mjs), unless that cannot be read,
 * and never longer than the run's quote pays for (quotedMusicMs). A bed already paid for keeps
 * the length it was made at.
 */
async function bedLength({ db, run, path, sizeMusic, log }) {
  const planned = Math.min(
    MUSIC_MAX_MS,
    Math.max(MUSIC_MIN_MS, Number(run.input?.music_length_ms) || 0),
  );
  if (run.output?.audio_path === path)
    return {
      ms: Number(run.output.audio_meta?.music_length_ms) || planned,
      basis: run.output.audio_meta?.music_basis ?? "stored",
    };
  try {
    const sized = await sizeMusic({ db, run, log });
    const quoted = quotedMusicMs(run);
    log(
      `[music] ${run.id} ${sized.ms} ms for a ${sized.filmS} s film (${sized.basis}; planned ${planned} ms, quoted ${quoted} ms)`,
    );
    // Past the quote the render loops the bed instead of the run spending what was not approved.
    return sized.ms > quoted ? { ms: quoted, basis: "quote" } : sized;
  } catch (error) {
    log(
      `[music] ${run.id} film length unknown (${error instanceof Error ? error.message : error}); using the planned ${planned} ms`,
    );
    return { ms: planned, basis: "run" };
  }
}

/** One music bed for the whole film. */
export async function generateMusic({
  db,
  run,
  apiKey,
  sizeMusic = musicLengthMs,
  log = console.log,
}) {
  const item = await loadRunItem(db, run);
  const prompt = String(run.input?.prompt ?? "").trim();
  if (!prompt || !Number(run.input?.music_length_ms))
    throw finalError("music run: prompt and music_length_ms are required");
  const path = assetPath(run, item.folder, "music");
  // Music has no OpenRouter route: without a working ElevenLabs key the film is assembled
  // without a music bed, and the run's error says so once, before any wait for the narration.
  if (!apiKey && run.output?.audio_path !== path)
    throw finalError("אין מפתח ElevenLabs למוזיקה. הסרט יורכב בלי מיטת מוזיקה");
  const length = await bedLength({ db, run, path, sizeMusic, log });
  const musicLengthMs = length.ms;
  await generateOnce({
    db,
    run,
    path,
    generate: async () => {
      try {
        return {
          bytes: await composeMusic({ apiKey, prompt, musicLengthMs }),
          // Kept on the run, so a retry after the payment records the length it paid for.
          meta: { music_length_ms: musicLengthMs, music_basis: length.basis },
        };
      } catch (error) {
        if (isPaidPlanError(error)) {
          throw finalError(
            "מוזיקת ElevenLabs דורשת תוכנית Pro. הסרט יורכב בלי מיטת מוזיקה",
          );
        }
        if (isRejectedKeyError(error)) {
          throw finalError(
            "מפתח ה-ElevenLabs לא תקין למוזיקה. הסרט יורכב בלי מיטת מוזיקה",
          );
        }
        throw error;
      }
    },
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
    // The length paid for, at the quote's rate: the budget settles on this (budget-settle.ts).
    costUsd: musicCostUsd(musicLengthMs),
  };
}
