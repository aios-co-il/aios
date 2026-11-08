/**
 * A narration take from the user's own recording (the board's "הקלטה בקול שלי",
 * supabase/functions/_shared/workshop/narration-guide.ts): ElevenLabs speech to speech keeps the
 * recording's timing, intonation and pronunciation and says it in the project's voice. No other
 * engine can do that, so there is no fallback: without ElevenLabs the run fails and says why.
 * Pronunciations and nikud are not applied: the user's reading already says each word.
 */

import { assertTenantPath, finalError } from "../guard.ts";
import {
  VOICE_CHANGE_MODEL,
  changeVoice,
  forceAlign,
  voiceChangeSeconds,
} from "../providers/elevenlabsVoiceChange.ts";
import { isPaidPlanError, isRejectedKeyError } from "../providers/plan.ts";
import { BUCKET, generateOnce } from "./audio-store.ts";
import { assertGuideLength } from "./guide-length.ts";
import { spokenAlignment } from "./spoken-alignment.ts";

/**
 * ElevenLabs bills speech to speech by the minute, the credits of 1,000 characters a minute. The
 * workshop quote uses the same rate (clip-prices.ts SPEECH_TO_SPEECH_USD_PER_MINUTE; the guide
 * take test keeps the two equal).
 */
export const SPEECH_TO_SPEECH_USD_PER_MINUTE = 0.12;

const NO_KEY =
  "החלפת הקול בהקלטה שלך דורשת חיבור ElevenLabs לארגון. חברו מפתח ElevenLabs ונסו שוב.";
const REFUSED =
  "ElevenLabs לא אישר את החלפת הקול (מפתח לא תקין או תוכנית בלי Voice Changer). בדקו את חיבור ElevenLabs ונסו שוב.";

/**
 * Makes and stores the take: the recording is read from the project's narration folder, voiced
 * again in the run's voice and timed against the script for the captions. Paid once per run
 * (generateOnce); the alignment runs after the paid call inside the same guard, and a failed
 * alignment keeps the take without timings (as an OpenRouter or Gemini take has none) instead of
 * losing what was paid for.
 */
export async function guideTake({
  db,
  run,
  path,
  submitting,
  script,
  apiKey,
  log,
  fetchImpl = fetch,
}) {
  if (!apiKey) {
    throw finalError(NO_KEY);
  }
  const guide = guideOf(run);
  const recording = await db.download(BUCKET, guide.path);
  await assertGuideLength(recording);
  return generateOnce({
    db,
    run,
    path,
    submitting,
    generate: async () => {
      const bytes = await voiced(
        {
          apiKey,
          voiceId: run.input.voice_id,
          audio: recording,
          contentType: contentTypeOf(guide.path),
          fetchImpl,
        },
        log,
      );
      const seconds = voiceChangeSeconds(bytes);
      const timing = await alignment(
        { apiKey, audio: bytes, text: script, fetchImpl },
        run,
        log,
      );
      return {
        bytes,
        contentType: "audio/mpeg",
        meta: {
          provider: "elevenlabs",
          model: VOICE_CHANGE_MODEL(),
          voice_id: run.input.voice_id,
          source: "guide",
          guide: { bucket: BUCKET, path: guide.path },
          alignment: timing.alignment,
          ...(timing.error ? { alignment_error: timing.error } : {}),
          seconds,
          cost_usd: guideCostUsd(seconds),
          pronunciations: {},
        },
      };
    },
  });
}

/** What a take of `seconds` cost at SPEECH_TO_SPEECH_USD_PER_MINUTE. */
export const guideCostUsd = (seconds: number) =>
  Math.round((seconds / 60) * SPEECH_TO_SPEECH_USD_PER_MINUTE * 10000) / 10000;

/**
 * The run's recording, checked again here: in creative-video, in the run's tenant folder and in
 * its own project's narration folder (the edge and queue_narration_guide check it first).
 */
function guideOf(run) {
  const guide = run.input?.guide_audio ?? {};
  const path = assertTenantPath(run.tenant_id, guide.path);
  if (
    guide.bucket !== BUCKET ||
    path.split("/")[2] !== run.item_id ||
    path.split("/")[3] !== "narration"
  ) {
    throw finalError(
      `guide recording outside the project's narration folder: ${path.slice(0, 120)}`,
    );
  }
  if (!run.input?.voice_id) {
    throw finalError("guide take: voice_id is required");
  }
  return { bucket: BUCKET, path };
}

/** The recording in the run's voice; a refused key or plan fails the run with a Hebrew reason. */
async function voiced(request: Parameters<typeof changeVoice>[0], log) {
  try {
    return await changeVoice(request);
  } catch (error) {
    if (isPaidPlanError(error) || isRejectedKeyError(error)) {
      log(
        `[voice] speech to speech refused: ${error instanceof Error ? error.message : error}`,
      );
      throw finalError(REFUSED);
    }
    throw error;
  }
}

/** The script's timings in the take, or null with the reason when the aligner fails (logged). */
async function alignment(request: Parameters<typeof forceAlign>[0], run, log) {
  try {
    const timed = await forceAlign(request);
    return {
      alignment: spokenAlignment(
        timed,
        timed.characters.join(""),
        request.text,
      ),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[voice] ${run.id} take kept without captions timing: ${message}`);
    return { alignment: null, error: message.slice(0, 300) };
  }
}

/** The recording's media type, from its extension (the board names it by the recorder's type). */
function contentTypeOf(path: string) {
  const ext = path.split(".").pop();
  return (
    {
      webm: "audio/webm",
      mp4: "audio/mp4",
      m4a: "audio/mp4",
      ogg: "audio/ogg",
      wav: "audio/wav",
      mp3: "audio/mpeg",
    }[ext] ?? "application/octet-stream"
  );
}
