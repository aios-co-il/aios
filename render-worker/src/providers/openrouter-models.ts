// The OpenRouter video models a clip may run on, and their planning prices.
// OpenRouter dropped every Kling model on 2026-11-25 (AIO-669); Veo 3.1 Fast costs about the same.
export const OPENROUTER_VIDEO_MODEL = "google/veo-3.1-fast";

/** Tried in order when OpenRouter no longer serves the model before them. */
export const OPENROUTER_VIDEO_FALLBACK_MODELS = [
  "x-ai/grok-imagine-video",
  "google/veo-3.1-lite",
];

/** OpenRouter's price per output second at 720p without audio (its /videos/models list). */
const MODEL_USD_PER_SECOND: Record<string, number> = {
  "kwaivgi/kling-v3.0-std": 0.084,
  "google/veo-3.1-fast": 0.08,
  "google/veo-3.1-lite": 0.03,
  "x-ai/grok-imagine-video": 0.07,
};

/** The fallback models, from `OPENROUTER_VIDEO_FALLBACK_MODELS` (comma separated) when set. */
export function fallbackVideoModels(): Array<string> {
  const configured = process.env.OPENROUTER_VIDEO_FALLBACK_MODELS;
  if (configured === undefined) {
    return OPENROUTER_VIDEO_FALLBACK_MODELS;
  }
  return configured
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

/** The planning price per second of a model; `OPENROUTER_VIDEO_USD_PER_SECOND` overrides it. */
export function videoUsdPerSecond(model: string): number {
  return (
    Number(process.env.OPENROUTER_VIDEO_USD_PER_SECOND) ||
    MODEL_USD_PER_SECOND[model] ||
    MODEL_USD_PER_SECOND[OPENROUTER_VIDEO_MODEL]
  );
}

/** OpenRouter no longer serves the model: `404 No endpoints found for <model>`. */
export function modelGone(status: number, message: string): boolean {
  return status === 404 && /no endpoints found|model not found/i.test(message);
}
