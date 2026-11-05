// Lip-sync providers: make a scene's character mouth its own voice line. Used only when the
// scene engine did not already speak the line in the clip (see nativeSpeech on the video
// providers). Same shape as the video providers:
//   estimate({ durationS })  -> { credits, usd }
//   submit(input)            -> { jobId }
//   poll(jobId)              -> { status: "pending" | "succeeded" | "failed", url?, bytes?,
//                                 costUsd?, error? }  (costUsd: what the provider charged)
// input: { imageBytes, imageUrl, audioBytes, audioUrl, videoUrl, prompt, line, motionPrompt,
//          durationS, aspect }
// `needs` says which picture the provider animates: "image" (the still) or "video" (the clip).
//
// Request shapes come from the published docs cited on each provider. None has been
// exercised with a paid call yet: verify each with one paid call before relying on it.
import { higgsfieldCredential } from "./higgsfield-credential.ts";
import { klingKeys } from "./kling.ts";
import { openRouterProvider } from "./openrouter.ts";
import type {
  EstimateInput,
  FetchImpl,
  LipsyncProvider,
  MediaInput,
  ProviderKeys,
} from "./types.ts";

/**
 * Lip-sync providers this tenant can run, best first: ElevenLabs (the tenant's own key, a
 * documented image+audio lip-sync model), Kling (the tenant's Kling pair, needs the clip),
 * HeyGen Avatar IV (the tenant's OpenRouter key, image+audio), Higgsfield.
 */
export function lipsyncCandidates(
  keys: ProviderKeys = {},
  env: NodeJS.ProcessEnv = process.env,
): Array<string> {
  const names: Array<string> = [];
  if (keys.elevenLabsKey) names.push("elevenlabs");
  const kling = klingKeys(
    { accessKey: keys.klingAccessKey, secretKey: keys.klingSecretKey },
    env,
  );
  if (kling.accessKey && kling.secretKey) names.push("kling");
  if (keys.openRouterKey) names.push("heygen");
  if (higgsfieldCredential(keys.higgsfieldKeyId, keys.higgsfieldKeySecret))
    names.push("higgsfield");
  // Last: Veo speaks the line itself from the still, so the voice is Veo's, not the chosen one.
  if (keys.openRouterKey) names.push("openrouter");
  return names;
}

/**
 * OpenRouter talking clip as the lip-sync fallback: the still and the line go to the talking
 * model (Veo 3.1 with audio), which says the line with matching lips in one generation.
 */
export function openRouterLipsyncProvider({
  apiKey,
  fetchImpl = fetch,
}: ApiKeyOptions = {}): LipsyncProvider {
  const base = openRouterProvider({ apiKey, fetchImpl });
  return {
    name: "openrouter",
    model: base.talkingModel,
    needs: "image",
    needsPublicMedia: true,
    estimate: ({ durationS }: EstimateInput) =>
      base.estimate({ durationS, talking: true }),
    submit: (input: MediaInput) =>
      base.submit({
        imageUrl: input.imageUrl,
        prompt: `${input.prompt} Spoken in Hebrew.`,
        durationS: input.durationS,
        aspect: input.aspect,
        talking: true,
      }),
    poll: (jobId: string) => base.poll(jobId),
  };
}

/** Planning price per second of talking video, until the first paid run gives the real one. */
const usdPerSecond = (name: string, fallback: number) =>
  Number(process.env[`${name.toUpperCase()}_LIPSYNC_USD_PER_SECOND`]) ||
  fallback;

export const estimateFor =
  (name: string, fallback = 0.1) =>
  ({ durationS }: EstimateInput) => ({
    credits: 0,
    usd: +(
      Math.max(1, Math.ceil(Number(durationS) || 5)) *
      usdPerSecond(name, fallback)
    ).toFixed(2),
  });

export const audioMime = (bytes: Uint8Array | null | undefined) => {
  // RIFF....WAVE
  if (bytes?.[0] === 0x52 && bytes?.[1] === 0x49 && bytes?.[2] === 0x46)
    return "audio/wav";
  return "audio/mpeg";
};

export const errorText = (data: unknown) => JSON.stringify(data).slice(0, 300);

/** A provider keyed by one API key. */
export interface ApiKeyOptions {
  apiKey?: string | null;
  fetchImpl?: FetchImpl;
}
