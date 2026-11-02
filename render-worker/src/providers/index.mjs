// Video provider adapter. Every provider has the same shape, so a provider can be swapped
// without touching the job, the UI or Carmen:
//   estimate(input)        -> { credits, usd }
//   submit(input)          -> { jobId }
//   poll(jobId)            -> { status: "pending" | "succeeded" | "failed", url?, bytes?, error? }
// input: { imageBytes, imageUrl, prompt, negativePrompt, durationS, aspect }
import { elevenLabsProvider } from "./elevenlabs.mjs";
import { higgsfieldCredential } from "./higgsfield-credential.mjs";
import { higgsfieldProvider } from "./higgsfield.mjs";
import { klingProvider } from "./kling.mjs";
import {
  elevenLabsLipsyncProvider,
  heygenLipsyncProvider,
  higgsfieldLipsyncProvider,
  klingLipsyncProvider,
  openRouterLipsyncProvider,
  lipsyncCandidates,
} from "./lipsync.mjs";
import { mockProvider } from "./mock.mjs";
import { openRouterProvider } from "./openrouter.mjs";

const LIPSYNC_PROVIDERS = {
  elevenlabs: (keys) =>
    elevenLabsLipsyncProvider({ apiKey: keys?.elevenLabsKey }),
  kling: (keys) =>
    klingLipsyncProvider({
      accessKey: keys?.klingAccessKey,
      secretKey: keys?.klingSecretKey,
    }),
  heygen: (keys) => heygenLipsyncProvider({ apiKey: keys?.openRouterKey }),
  higgsfield: (keys) =>
    higgsfieldLipsyncProvider({
      keyId: keys?.higgsfieldKeyId,
      keySecret: keys?.higgsfieldKeySecret,
    }),
  openrouter: (keys) =>
    openRouterLipsyncProvider({ apiKey: keys?.openRouterKey }),
};

/**
 * Lip-sync providers whose mouth follows the voice file as it is (Creatify Aurora, Kling
 * audio2video, HeyGen Avatar IV), so the line's word timings hold for the film's captions.
 */
export const AUDIO_DRIVEN_LIPSYNC = new Set(["elevenlabs", "kling", "heygen"]);

/** A lip-sync provider that says the line in its own voice (OpenRouter Veo), never the chosen one. */
export const speaksInOwnVoice = (name) => name === "openrouter";

/** A lip-sync provider by name (elevenlabs | kling | heygen | higgsfield | openrouter). */
export function getLipsyncProvider(name, keys = {}) {
  const factory = LIPSYNC_PROVIDERS[name];
  if (!factory)
    throw new Error(
      `Unknown lip-sync provider "${name}" (expected ${Object.keys(LIPSYNC_PROVIDERS).join(", ")})`,
    );
  return factory(keys);
}

/**
 * The lip-sync providers to try, in order: the run's saved or requested one, LIPSYNC_PROVIDER,
 * then every provider this tenant has a key for. Empty means there is no way to lip-sync.
 */
export function lipsyncProviderNames(run, keys = {}, env = process.env) {
  const wanted = [
    run?.provider_job_id ? run.provider : null,
    run?.input?.provider,
    env.LIPSYNC_PROVIDER,
  ].filter((name) => name && LIPSYNC_PROVIDERS[name]);
  if (run?.provider_job_id && wanted[0]) return [wanted[0]];
  return [...new Set([...wanted, ...lipsyncCandidates(keys, env)])];
}

/**
 * Prompt for a scene whose character speaks: the line is quoted so a speech-capable model
 * (Veo 3.1, Seedance 2.5) says it with matching lips. Always ends with the no-text rule.
 */
export const talkingPrompt = (motionPrompt, { line, speaker } = {}) =>
  [
    String(motionPrompt ?? "").trim() ||
      "Subtle natural motion, gentle camera push-in.",
    `${String(speaker ?? "").trim() || "The character"} looks at the camera and says in Hebrew, with natural lip movement matching every word: "${String(line ?? "").trim()}".`,
    "Only this line is spoken. No subtitles. No text, no letters, no logos.",
  ].join(" ");

const PROVIDERS = {
  kling: (keys) =>
    klingProvider({
      accessKey: keys?.klingAccessKey,
      secretKey: keys?.klingSecretKey,
    }),
  mock: () => mockProvider(),
  elevenlabs: (keys) => elevenLabsProvider({ apiKey: keys?.elevenLabsKey }),
  openrouter: (keys) =>
    openRouterProvider({
      apiKey: keys?.openRouterKey,
      model: keys?.openRouterVideoModel,
    }),
  higgsfield: (keys) =>
    higgsfieldProvider({
      keyId: keys?.higgsfieldKeyId,
      keySecret: keys?.higgsfieldKeySecret,
    }),
};

/** The free preview engine: no key, no charge, and where a refused paid clip ends. */
export const PREVIEW_PROVIDER = "mock";

/**
 * The paid engine a clip moves to when its engine refused it, before the free preview. Its key
 * is the tenant's OpenRouter brain, read from Vault only when a run needs it (usesVaultKey).
 */
export const FALLBACK_VIDEO_PROVIDER = "openrouter";

/** An engine whose key is read from Vault (the tenant's OpenRouter brain) only when needed. */
export const usesVaultKey = (name) => name === FALLBACK_VIDEO_PROVIDER;

/**
 * The engines to try first when `name`'s plan cannot make video (a plan refusal): an ElevenLabs
 * plan moves to Higgsfield when the tenant has its key. null: the engine has no such refusal.
 */
export function planFallbacks(name, keys) {
  if (name !== "elevenlabs") return null;
  return higgsfieldCredential(keys?.higgsfieldKeyId, keys?.higgsfieldKeySecret)
    ? ["higgsfield"]
    : [];
}

/** The model a clip is made with: the engine's talking model when the clip speaks. */
export const clipModel = (provider, talking) =>
  (talking && provider.talkingModel) || provider.model;

export function getVideoProvider(
  name = process.env.VIDEO_PROVIDER || PREVIEW_PROVIDER,
  keys = {},
) {
  const factory = PROVIDERS[name];
  if (!factory)
    throw new Error(
      `Unknown VIDEO_PROVIDER "${name}" (expected ${Object.keys(PROVIDERS).join(", ")})`,
    );
  return factory(keys);
}

/** Every clip prompt ends with the no-text rule; image models garble Hebrew. */
export const clipPrompt = (motionPrompt) =>
  [
    String(motionPrompt ?? "").trim() ||
      "Subtle natural motion, gentle camera push-in.",
    "No text, no letters, no logos.",
  ].join(" ");
