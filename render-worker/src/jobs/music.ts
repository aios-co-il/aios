/** The music job: one bed for the whole film, sized to the film that will be rendered. */

import { finalError, loadRunItem } from "../guard.ts";
import { MUSIC_MODEL, composeMusic } from "../providers/elevenlabsSound.ts";
import { isPaidPlanError, isRejectedKeyError } from "../providers/plan.ts";
import { BUCKET, assetPath, generateOnce } from "./audio-store.ts";
import {
  MUSIC_MAX_MS,
  MUSIC_MIN_MS,
  musicCostUsd,
  musicLengthMs,
  quotedMusicMs,
} from "./music-length.ts";

/** One music bed for the whole film. */
export async function generateMusic({
  db,
  run,
  apiKey,
  sizeMusic = musicLengthMs,
  log = console.log,
  submitting,
}) {
  const item = await loadRunItem(db, run);
  const prompt = String(run.input?.prompt ?? "").trim();
  if (!prompt || !Number(run.input?.music_length_ms)) {
    throw finalError("music run: prompt and music_length_ms are required");
  }
  const path = assetPath(run, item.folder, "music");
  // Music has no OpenRouter route: without a working ElevenLabs key the film is assembled
  // without a music bed, and the run's error says so once, before any wait for the narration.
  if (!apiKey && run.output?.audio_path !== path) {
    throw finalError("אין מפתח ElevenLabs למוזיקה. הסרט יורכב בלי מיטת מוזיקה");
  }
  const length = await bedLength({ db, run, path, sizeMusic, log });
  const musicLengthMs = length.ms;
  await generateOnce({
    db,
    run,
    path,
    submitting,
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
  if (!existing?.length) {
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
  }
  log(`[music] ${run.id} stored ${path}`);
  return {
    output: { path, provider: "elevenlabs" },
    provider: "elevenlabs",
    credits: 0,
    // The length paid for, at the quote's rate: the budget settles on this (budget-settle.ts).
    costUsd: musicCostUsd(musicLengthMs),
  };
}

/**
 * The bed's length. The run's music_length_ms is the storyboard's planned total; the bed is
 * sized to the film that will be rendered instead (music-length.ts), unless that cannot be read,
 * and never longer than the run's quote pays for (quotedMusicMs). A bed already paid for keeps
 * the length it was made at.
 */
async function bedLength({ db, run, path, sizeMusic, log }) {
  const planned = Math.min(
    MUSIC_MAX_MS,
    Math.max(MUSIC_MIN_MS, Number(run.input?.music_length_ms) || 0),
  );
  if (run.output?.audio_path === path) {
    return {
      ms: Number(run.output.audio_meta?.music_length_ms) || planned,
      basis: run.output.audio_meta?.music_basis ?? "stored",
    };
  }
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
