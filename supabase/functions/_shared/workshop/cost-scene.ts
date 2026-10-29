/**
 * A film scene as the quote prices it, and the per-part estimates (clips, voice, music bed). The
 * per-unit rates come from clip-prices.ts, which the video page's estimate (videoEngines.ts)
 * shares; cost-scene.test.ts keeps the two estimates in step.
 */

import {
  ELEVENLABS_VIDEO_USD_PER_SECOND,
  HIGGSFIELD_USD_PER_SECOND,
  KLING_CREDITS_PER_5S,
  KLING_USD_PER_5S,
  MUSIC_USD_PER_MINUTE,
  OPENROUTER_USD_PER_SECOND,
  VOICE_USD_PER_1000_CHARS,
  musicQuoteSeconds,
  voiceCharacters,
} from "./clip-prices.ts";
import { type SceneEngine, sceneClipSeconds } from "./scene-engine.ts";
import { talkingMeta } from "./talking.ts";

export interface CostScene {
  duration_s: number;
  voiceover_text: string;
  /** A talking scene (meta.lipsync): the character says `dialogue`, else the voiceover. */
  lipsync?: boolean;
  dialogue?: string;
  /**
   * The line is spoken in the project's chosen voice (meta.chosen_voice, e.g. Yael): the engine
   * never speaks it, so the scene always pays for its own voice line and a lip-sync pass.
   */
  chosen_voice?: boolean;
}

/** A marketing_video_scenes row as the quote prices it. */
export function costSceneOf(scene: {
  duration_s?: unknown;
  voiceover_text?: unknown;
  meta?: unknown;
}): CostScene {
  const talk = talkingMeta(scene.meta);
  return {
    duration_s: Number(scene.duration_s) || 3,
    voiceover_text: String(scene.voiceover_text ?? ""),
    lipsync: talk.lipsync,
    dialogue: talk.dialogue,
    chosen_voice: talk.chosenVoice,
  };
}

export interface Estimate {
  usd: number;
  credits: number;
}

/** The clips' price on this engine, and the seconds they render. */
export function clipEstimate(engine: SceneEngine, scenes: CostScene[]) {
  const seconds = scenes.reduce(
    (sum, scene) => sum + sceneClipSeconds(engine, scene.duration_s),
    0,
  );
  if (engine === "mock") return { usd: 0, credits: 0, seconds };
  if (engine === "kling") {
    const blocks = seconds / 5;
    return {
      usd: roundUsd(blocks * KLING_USD_PER_5S),
      credits: blocks * KLING_CREDITS_PER_5S,
      seconds,
    };
  }
  if (engine === "openrouter") {
    // OpenRouter bills a Kling clip for at least 5 s, even a shorter one (seen on real jobs).
    const billed = scenes.reduce(
      (sum, scene) =>
        sum +
        openRouterBilledSeconds(sceneClipSeconds(engine, scene.duration_s)),
      0,
    );
    return {
      usd: roundUsd(billed * OPENROUTER_USD_PER_SECOND),
      credits: 0,
      seconds,
    };
  }
  const rate =
    engine === "elevenlabs"
      ? ELEVENLABS_VIDEO_USD_PER_SECOND
      : HIGGSFIELD_USD_PER_SECOND;
  return { usd: roundUsd(seconds * rate), credits: 0, seconds };
}

/** The narration's price, by the characters the engine is billed for (voiceCharacters). */
export function voiceEstimate(scenes: CostScene[]): Estimate {
  const characters = scenes.reduce(
    (sum, scene) => sum + voiceCharacters(scene.voiceover_text),
    0,
  );
  return {
    usd: roundUsd((characters / 1000) * VOICE_USD_PER_1000_CHARS),
    credits: 0,
  };
}

/** The music bed, priced for the film it will cover (musicQuoteSeconds in clip-prices.ts). */
export function musicEstimate(scenes: CostScene[]): Estimate {
  const seconds = musicQuoteSeconds(
    scenes.reduce((sum, scene) => sum + (Number(scene.duration_s) || 0), 0),
  );
  return { usd: roundUsd((seconds / 60) * MUSIC_USD_PER_MINUTE), credits: 0 };
}

export const roundUsd = (value: number) => Math.round(value * 100) / 100;

/** OpenRouter charges a Kling clip for 5 s at least (a 3 s clip cost $0.42, not $0.25). */
export const openRouterBilledSeconds = (seconds: number) =>
  Math.max(5, seconds);
