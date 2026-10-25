/**
 * Planning prices for a film production, shown to the user before any spend. These mirror
 * src/components/marketing/departments/creative/videoEngines.ts; video-cost.test.ts keeps the
 * two in step.
 */

import { higgsfieldCredential } from "./higgsfield-credential.ts";

export type SceneEngine =
  "mock" | "kling" | "elevenlabs" | "higgsfield" | "openrouter";

export const ENGINE_LABEL: Record<SceneEngine, string> = {
  mock: "חינם — תצוגה",
  kling: "Kling",
  elevenlabs: "ElevenLabs",
  higgsfield: "Higgsfield",
  openrouter: "OpenRouter (Kling 3)",
};

const KLING_USD_PER_5S = 0.85;
const KLING_CREDITS_PER_5S = 5100;
const ELEVENLABS_VIDEO_USD_PER_SECOND = 0.15;
const HIGGSFIELD_USD_PER_SECOND = 0.1;
/** OpenRouter kwaivgi/kling-v3.0-std (720p, no audio); Veo 3.1 for a talking scene. */
const OPENROUTER_USD_PER_SECOND = 0.084;
const OPENROUTER_TALKING_USD_PER_SECOND = 0.4;
const VOICE_USD_PER_1000_CHARS = 0.12;
const MUSIC_USD_PER_MINUTE = 0.5;

const roundUsd = (value: number) => Math.round(value * 100) / 100;

export const isSceneEngine = (value: unknown): value is SceneEngine =>
  value === "mock" ||
  value === "kling" ||
  value === "elevenlabs" ||
  value === "higgsfield" ||
  value === "openrouter";

export function sceneClipSeconds(engine: SceneEngine, duration: number) {
  if (engine === "elevenlabs") {
    const seconds = Number(duration) || 5;
    return seconds <= 4 ? 4 : seconds <= 6 ? 6 : 8;
  }
  if (engine === "higgsfield")
    return Math.min(15, Math.max(1, Math.ceil(Number(duration) || 5)));
  // OpenRouter's default video model, Kling v3, renders 3 to 15 s.
  if (engine === "openrouter")
    return Math.min(15, Math.max(3, Math.ceil(Number(duration) || 5)));
  return Number(duration) > 5 ? 10 : 5;
}

/** Veo 3.1 renders 4, 6 or 8 s; OpenRouter makes a talking scene on it. */
const veoSeconds = (duration: number) => {
  const seconds = Number(duration) || 5;
  return seconds <= 4 ? 4 : seconds <= 6 ? 6 : 8;
};

export interface CostScene {
  duration_s: number;
  voiceover_text: string;
  /** A talking scene (meta.lipsync): the character says `dialogue`, else the voiceover. */
  lipsync?: boolean;
  dialogue?: string;
}

/**
 * Lip sync, planning price per second of talking video until the first paid run. ElevenLabs
 * Creatify Aurora, Kling lip-sync and Higgsfield Seedance 2.5 all bill by length; the worker
 * picks the first one the tenant has a key for (render-worker/src/providers/lipsync.mjs).
 */
export const LIPSYNC_USD_PER_SECOND = 0.1;

/** Engines whose clip speaks the line itself (Veo 3.1, Seedance 2.5), so no lip-sync pass. */
export const speaksNatively = (engine: SceneEngine) =>
  engine === "elevenlabs" || engine === "higgsfield" || engine === "openrouter";

const talkingLine = (scene: CostScene) =>
  scene.lipsync
    ? String(scene.dialogue ?? "").trim() || scene.voiceover_text.trim()
    : "";

/**
 * Talking scenes. On an engine that speaks, the clip already carries the line (no extra).
 * Otherwise each talking scene pays for its own voice line plus a lip-sync pass.
 */
export function lipsyncEstimate(engine: SceneEngine, scenes: CostScene[]) {
  const talking = scenes.filter((scene) => talkingLine(scene));
  // OpenRouter makes a talking scene on Veo 3.1 with audio instead of the Kling clip that
  // clipEstimate already counted; only the difference is added here.
  if (talking.length > 0 && engine === "openrouter") {
    const extra = talking.reduce(
      (sum, scene) =>
        sum +
        veoSeconds(scene.duration_s) * OPENROUTER_TALKING_USD_PER_SECOND -
        sceneClipSeconds(engine, scene.duration_s) * OPENROUTER_USD_PER_SECOND,
      0,
    );
    return {
      usd: roundUsd(Math.max(0, extra)),
      credits: 0,
      scenes: talking.length,
      native: true,
    };
  }
  if (talking.length === 0 || speaksNatively(engine))
    return {
      usd: 0,
      credits: 0,
      scenes: talking.length,
      native: talking.length > 0,
    };
  const seconds = talking.reduce(
    (sum, scene) => sum + Math.max(1, Math.ceil(Number(scene.duration_s) || 5)),
    0,
  );
  const voice = voiceEstimate(
    talking.map((scene) => ({ ...scene, voiceover_text: talkingLine(scene) })),
  );
  return {
    usd: roundUsd(seconds * LIPSYNC_USD_PER_SECOND + voice.usd),
    credits: 0,
    scenes: talking.length,
    native: false,
  };
}

export interface Estimate {
  usd: number;
  credits: number;
}

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
  const rate =
    engine === "elevenlabs"
      ? ELEVENLABS_VIDEO_USD_PER_SECOND
      : engine === "openrouter"
        ? OPENROUTER_USD_PER_SECOND
        : HIGGSFIELD_USD_PER_SECOND;
  return { usd: roundUsd(seconds * rate), credits: 0, seconds };
}

export function voiceEstimate(scenes: CostScene[]): Estimate {
  const characters = scenes.reduce(
    (sum, scene) => sum + scene.voiceover_text.trim().length,
    0,
  );
  return {
    usd: roundUsd((characters / 1000) * VOICE_USD_PER_1000_CHARS),
    credits: 0,
  };
}

export function musicEstimate(scenes: CostScene[]): Estimate {
  const seconds = scenes.reduce(
    (sum, scene) => sum + (Number(scene.duration_s) || 0),
    0,
  );
  return { usd: roundUsd((seconds / 60) * MUSIC_USD_PER_MINUTE), credits: 0 };
}

/** Everything produce_video will queue for scenes that have a still and no clip yet. */
export function productionEstimate(
  engine: SceneEngine,
  scenes: CostScene[],
  options: { withVoice: boolean; withMusic: boolean },
) {
  const clips = clipEstimate(engine, scenes);
  // A talking scene is not narrated; its own line is priced with its lip sync.
  const spoken = scenes.filter(
    (scene) => !scene.lipsync && scene.voiceover_text.trim(),
  );
  const voice =
    options.withVoice && spoken.length > 0
      ? voiceEstimate(spoken)
      : { usd: 0, credits: 0 };
  const music = options.withMusic
    ? musicEstimate(scenes)
    : { usd: 0, credits: 0 };
  const talking = lipsyncEstimate(engine, scenes);
  const lipsync = { usd: talking.usd, credits: talking.credits };
  return {
    clips: { usd: clips.usd, credits: clips.credits },
    voice,
    music,
    lipsync,
    talkingScenes: talking.scenes,
    totalUsd: roundUsd(clips.usd + voice.usd + music.usd + lipsync.usd),
    clipSeconds: clips.seconds,
  };
}

/** Connections outside the LLM integration settings that can make video. */
export interface VideoConnections {
  /** The tenant connected OpenRouter as a Carmen brain (existence only; no key here). */
  openrouter?: boolean;
}

/**
 * The engine the tenant can actually use: its own ElevenLabs or Higgsfield keys, then an
 * OpenRouter brain connection, else the free preview.
 */
export function engineFromKeys(
  settings: Record<string, unknown>,
  connections: VideoConnections = {},
): SceneEngine {
  const has = (key: string) =>
    typeof settings[key] === "string" &&
    (settings[key] as string).trim() !== "";
  if (has("elevenlabs_api_key")) return "elevenlabs";
  if (higgsfieldReady(settings)) return "higgsfield";
  if (connections.openrouter) return "openrouter";
  return "mock";
}

const higgsfieldReady = (settings: Record<string, unknown>) =>
  higgsfieldCredential(
    settings.higgsfield_api_key_id,
    settings.higgsfield_api_key_secret,
  ).includes(":");

const hasKey = (settings: Record<string, unknown>, key: string) =>
  typeof settings[key] === "string" && (settings[key] as string).trim() !== "";

/** Image and video generation on ElevenLabs starts at Pro. Starter and free stay on Higgsfield. */
export function elevenLabsTierAllowsMedia(tier: unknown): boolean {
  const name = String(tier ?? "").toLowerCase();
  return (
    name === "pro" ||
    name === "creator" ||
    name === "scale" ||
    name === "business" ||
    name === "enterprise"
  );
}

/** null means the subscription could not be read, so a Pro account is not dropped on a blip. */
export async function elevenLabsMediaAllowed(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | null> {
  try {
    const response = await fetchImpl(
      "https://api.elevenlabs.io/v1/user/subscription",
      { headers: { "xi-api-key": apiKey } },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const tier =
      (data as { tier?: unknown; subscription?: { tier?: unknown } }).tier ??
      (data as { subscription?: { tier?: unknown } }).subscription?.tier;
    return elevenLabsTierAllowsMedia(tier);
  } catch {
    return null;
  }
}

/**
 * Picks a scene engine the account can run. ElevenLabs video needs Pro; a Starter key
 * uses Higgsfield when it is connected, then OpenRouter, otherwise the free preview.
 */
export async function sceneEngineFor(
  settings: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
  connections: VideoConnections = {},
): Promise<SceneEngine> {
  const fallback: SceneEngine = higgsfieldReady(settings)
    ? "higgsfield"
    : connections.openrouter
      ? "openrouter"
      : "mock";
  const elevenKey = hasKey(settings, "elevenlabs_api_key")
    ? String(settings.elevenlabs_api_key).trim()
    : "";
  if (elevenKey) {
    const allowed = await elevenLabsMediaAllowed(elevenKey, fetchImpl);
    if (allowed !== false) return "elevenlabs";
  }
  return fallback;
}
