/**
 * Planning prices for a film production, shown to the user before any spend. The per-unit
 * rates come from clip-prices.ts, which the video page's estimate (videoEngines.ts) shares;
 * video-cost.test.ts keeps the two estimates in step.
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
} from "./clip-prices.ts";
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

/** Veo 3.1 for a talking scene. */
const OPENROUTER_TALKING_USD_PER_SECOND = 0.4;

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

/** OpenRouter charges a Kling clip for 5 s at least (a 3 s clip cost $0.42, not $0.25). */
const openRouterBilledSeconds = (seconds: number) => Math.max(5, seconds);

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

/**
 * Trailer sound design: one whoosh (1.2 s) and one low impact (2.5 s) made once per film with
 * ElevenLabs sound effects, in the production's own render (render-worker
 * jobs/sound-effects-catalog.mjs): 3.7 s at 40 credits a second at $0.0003 a credit is $0.0444,
 * rounded up to the cent. A render outside a production never pays for them.
 */
export const SOUND_EFFECTS_USD = 0.05;

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
        openRouterBilledSeconds(sceneClipSeconds(engine, scene.duration_s)) *
          OPENROUTER_USD_PER_SECOND,
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

/** The music bed, priced for the film it will cover (musicQuoteSeconds in clip-prices.ts). */
export function musicEstimate(scenes: CostScene[]): Estimate {
  const seconds = musicQuoteSeconds(
    scenes.reduce((sum, scene) => sum + (Number(scene.duration_s) || 0), 0),
  );
  return { usd: roundUsd((seconds / 60) * MUSIC_USD_PER_MINUTE), credits: 0 };
}

export interface ProductionOptions {
  withVoice: boolean;
  withMusic: boolean;
  /** Trailer sound effects, made in the production's render (see SOUND_EFFECTS_USD). */
  withSoundEffects?: boolean;
}

/** Everything produce_video will queue for scenes that have a still and no clip yet. */
export function productionEstimate(
  engine: SceneEngine,
  scenes: CostScene[],
  options: ProductionOptions,
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
  const soundEffects = options.withSoundEffects
    ? { usd: SOUND_EFFECTS_USD, credits: 0 }
    : { usd: 0, credits: 0 };
  return {
    clips: { usd: clips.usd, credits: clips.credits },
    voice,
    music,
    lipsync,
    soundEffects,
    talkingScenes: talking.scenes,
    totalUsd: roundUsd(
      clips.usd + voice.usd + music.usd + lipsync.usd + soundEffects.usd,
    ),
    clipSeconds: clips.seconds,
  };
}

/**
 * The price to approve. The worker moves a clip that a paid engine refuses to OpenRouter when
 * the tenant has it (render-worker/src/clip-fallback.mjs), so the quote covers the dearer one.
 */
/**
 * A talking scene on an engine that cannot speak goes through the worker's lip-sync chain, which
 * ends at OpenRouter Veo when the tenant has it (render-worker providers/lipsync.mjs): quote that.
 */
function withLipsyncFallback(
  estimate: ReturnType<typeof productionEstimate>,
  engine: SceneEngine,
  scenes: CostScene[],
  connections: VideoConnections,
) {
  const talking = lipsyncEstimate(engine, scenes);
  if (!connections.openrouter || talking.native || talking.scenes === 0)
    return estimate;
  const veo = roundUsd(
    scenes
      .filter((scene) => talkingLine(scene))
      .reduce(
        (sum, scene) =>
          sum +
          veoSeconds(scene.duration_s) * OPENROUTER_TALKING_USD_PER_SECOND,
        0,
      ),
  );
  if (veo <= estimate.lipsync.usd) return estimate;
  return {
    ...estimate,
    lipsync: { usd: veo, credits: estimate.lipsync.credits },
    totalUsd: roundUsd(estimate.totalUsd - estimate.lipsync.usd + veo),
  };
}

export function quotedProductionEstimate(
  engine: SceneEngine,
  scenes: CostScene[],
  options: ProductionOptions,
  connections: VideoConnections = {},
) {
  const own = withLipsyncFallback(
    productionEstimate(engine, scenes, options),
    engine,
    scenes,
    connections,
  );
  if (engine === "mock" || engine === "openrouter" || !connections.openrouter)
    return { ...own, pricedOn: engine };
  const fallback = productionEstimate("openrouter", scenes, options);
  return fallback.totalUsd > own.totalUsd
    ? { ...fallback, pricedOn: "openrouter" as SceneEngine }
    : { ...own, pricedOn: engine };
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
  // The tenant's OpenRouter brain comes first: David chose it for video (Kling, Veo, Seedance).
  if (connections.openrouter) return "openrouter";
  if (has("elevenlabs_api_key")) return "elevenlabs";
  if (higgsfieldReady(settings)) return "higgsfield";
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
 * Picks a scene engine the account can run: the OpenRouter brain when connected, then ElevenLabs
 * video (it needs Pro), then Higgsfield, otherwise the free preview.
 */
export async function sceneEngineFor(
  settings: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
  connections: VideoConnections = {},
): Promise<SceneEngine> {
  if (connections.openrouter) return "openrouter";
  const fallback: SceneEngine = higgsfieldReady(settings)
    ? "higgsfield"
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
