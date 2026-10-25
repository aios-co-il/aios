/**
 * Planning prices for a film production, shown to the user before any spend. These mirror
 * src/components/marketing/departments/creative/videoEngines.ts; video-cost.test.ts keeps the
 * two in step.
 */

export type SceneEngine = "mock" | "kling" | "elevenlabs" | "higgsfield";

export const ENGINE_LABEL: Record<SceneEngine, string> = {
  mock: "חינם — תצוגה",
  kling: "Kling",
  elevenlabs: "ElevenLabs",
  higgsfield: "Higgsfield",
};

const KLING_USD_PER_5S = 0.85;
const KLING_CREDITS_PER_5S = 5100;
const ELEVENLABS_VIDEO_USD_PER_SECOND = 0.15;
const HIGGSFIELD_USD_PER_SECOND = 0.1;
const VOICE_USD_PER_1000_CHARS = 0.12;
const MUSIC_USD_PER_MINUTE = 0.5;

const roundUsd = (value: number) => Math.round(value * 100) / 100;

export const isSceneEngine = (value: unknown): value is SceneEngine =>
  value === "mock" ||
  value === "kling" ||
  value === "elevenlabs" ||
  value === "higgsfield";

export function sceneClipSeconds(engine: SceneEngine, duration: number) {
  if (engine === "elevenlabs") {
    const seconds = Number(duration) || 5;
    return seconds <= 4 ? 4 : seconds <= 6 ? 6 : 8;
  }
  if (engine === "higgsfield")
    return Math.min(15, Math.max(1, Math.ceil(Number(duration) || 5)));
  return Number(duration) > 5 ? 10 : 5;
}

export interface CostScene {
  duration_s: number;
  voiceover_text: string;
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
  const spoken = scenes.filter((scene) => scene.voiceover_text.trim());
  const voice =
    options.withVoice && spoken.length > 0
      ? voiceEstimate(spoken)
      : { usd: 0, credits: 0 };
  const music = options.withMusic
    ? musicEstimate(scenes)
    : { usd: 0, credits: 0 };
  return {
    clips: { usd: clips.usd, credits: clips.credits },
    voice,
    music,
    totalUsd: roundUsd(clips.usd + voice.usd + music.usd),
    clipSeconds: clips.seconds,
  };
}

/** The engine the tenant can actually use: its own ElevenLabs or Higgsfield keys, else the free preview. */
export function engineFromKeys(settings: Record<string, unknown>): SceneEngine {
  const has = (key: string) =>
    typeof settings[key] === "string" &&
    (settings[key] as string).trim() !== "";
  if (has("elevenlabs_api_key")) return "elevenlabs";
  if (has("higgsfield_api_key_id") && has("higgsfield_api_key_secret"))
    return "higgsfield";
  return "mock";
}

const hasKey = (settings: Record<string, unknown>, key: string) =>
  typeof settings[key] === "string" &&
  (settings[key] as string).trim() !== "";

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
 * uses Higgsfield when it is connected, otherwise the free preview.
 */
export async function sceneEngineFor(
  settings: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<SceneEngine> {
  const higgsfield =
    hasKey(settings, "higgsfield_api_key_id") &&
    hasKey(settings, "higgsfield_api_key_secret");
  const elevenKey = hasKey(settings, "elevenlabs_api_key")
    ? String(settings.elevenlabs_api_key).trim()
    : "";
  if (elevenKey) {
    const allowed = await elevenLabsMediaAllowed(elevenKey, fetchImpl);
    if (allowed !== false) return "elevenlabs";
    return higgsfield ? "higgsfield" : "mock";
  }
  return higgsfield ? "higgsfield" : "mock";
}
