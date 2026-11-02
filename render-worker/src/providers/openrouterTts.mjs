// ElevenLabs speech through OpenRouter (POST /api/v1/audio/speech) with the tenant's OpenRouter
// key, for a tenant whose own ElevenLabs key is missing or refused. The answer is the raw audio
// (mp3 when asked) with an X-Generation-Id header; the price is read from that generation's
// record (GET /api/v1/generation) and falls back to the per-character list price. No word
// timestamps come back. Docs: https://openrouter.ai/docs/guides/overview/multimodal/tts and
// https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/
import { finalError } from "../guard.mjs";

const BASE = () =>
  (process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1").replace(
    /\/$/,
    "",
  );
/** Eleven v4 speaks 90+ languages, Hebrew included; the direct path uses eleven_v4 too. */
export const OPENROUTER_TTS_MODEL = () =>
  process.env.OPENROUTER_TTS_MODEL || "elevenlabs/eleven-v4";
/** A premade voice for a run that names none, or names one OpenRouter cannot use. */
export const OPENROUTER_TTS_VOICE = () =>
  process.env.OPENROUTER_TTS_VOICE || "sarah";
/** Eleven v4 list price on OpenRouter, per character of input. */
const USD_PER_CHAR = () =>
  Number(process.env.OPENROUTER_TTS_USD_PER_CHAR) || 0.00008;

export const openRouterSpeechBody = (
  text,
  voice,
  model = OPENROUTER_TTS_MODEL(),
) => ({ model, input: text, voice, response_format: "mp3" });

export const openRouterSpeechEstimate = (text) =>
  Math.round(String(text ?? "").length * USD_PER_CHAR() * 10000) / 10000;

/** What OpenRouter charged for a generation, or null while its record is not ready. */
export async function openRouterGenerationCost({
  apiKey,
  generationId,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 3,
}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(
        `${BASE()}/generation?id=${encodeURIComponent(generationId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      const data = await response.json().catch(() => ({}));
      const cost = Number(data?.data?.total_cost);
      if (response.ok && Number.isFinite(cost) && cost >= 0) return cost;
    } catch {
      // Best effort: the audio is already paid for and must still be stored.
    }
    if (attempt < attempts - 1) await sleep(1000);
  }
  return null;
}

export async function synthesizeOpenRouterSpeech({
  apiKey,
  voiceId,
  text,
  fetchImpl = fetch,
  sleep,
}) {
  if (!apiKey) throw new Error("OpenRouter key is required for OpenRouter TTS");
  const model = OPENROUTER_TTS_MODEL();
  const fallbackVoice = OPENROUTER_TTS_VOICE();
  const voices =
    voiceId && voiceId !== fallbackVoice
      ? [voiceId, fallbackVoice]
      : [fallbackVoice];
  for (const voice of voices) {
    const response = await fetchImpl(`${BASE()}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openRouterSpeechBody(text, voice, model)),
    });
    if (response.ok) {
      // OpenRouter charged on the 200, so a failure from here on is final: neither the worker's
      // retry nor another provider may pay for this narration again.
      let bytes;
      try {
        bytes = Buffer.from(await response.arrayBuffer());
      } catch (error) {
        throw finalError(
          `openrouter speech was charged but its audio could not be read (${error instanceof Error ? error.message : error}); not retried to avoid paying again`,
        );
      }
      if (bytes.length === 0)
        throw finalError(
          "openrouter speech was charged but returned no audio; not retried to avoid paying again",
        );
      const generationId = response.headers.get("x-generation-id");
      const reported = generationId
        ? await openRouterGenerationCost({
            apiKey,
            generationId,
            fetchImpl,
            ...(sleep ? { sleep } : {}),
          })
        : null;
      return {
        bytes,
        contentType:
          response.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
        model,
        voice,
        generationId,
        costUsd: reported ?? openRouterSpeechEstimate(text),
        costReported: reported !== null,
      };
    }
    const body = await response.text().catch(() => "");
    // A voice OpenRouter cannot use (one cloned in the tenant's own account) gets one more try
    // with a premade voice; a refused request is not billed.
    if (
      (response.status === 400 || response.status === 404) &&
      voice !== voices[voices.length - 1] &&
      /voice/i.test(body)
    )
      continue;
    throw Object.assign(
      new Error(`openrouter speech ${response.status}: ${body.slice(0, 300)}`),
      { status: response.status },
    );
  }
  throw new Error("openrouter speech: no voice");
}
