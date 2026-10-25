// Gemini speech. The response carries the audio in inlineData with its own mimeType: raw 16-bit
// PCM (audio/L16;rate=24000) is wrapped in a WAV header, a ready file is kept as it is. Hebrew is
// detected from the transcript, so only the transcript is sent and nothing extra is read aloud.
export const GEMINI_TTS_MODEL = () =>
  process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";

export const GEMINI_TTS_VOICE = () => process.env.GEMINI_TTS_VOICE || "Kore";

/** Paid-tier list prices per million tokens; override when Google changes them. */
const USD_PER_M_INPUT = () => Number(process.env.GEMINI_TTS_USD_PER_M_INPUT) || 0.5;
const USD_PER_M_OUTPUT = () => Number(process.env.GEMINI_TTS_USD_PER_M_OUTPUT) || 10;
/** Gemini counts 25 audio tokens per second of speech. */
const AUDIO_TOKENS_PER_SECOND = 25;

const BASE = () =>
  (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com").replace(
    /\/$/,
    "",
  );

export function geminiSpeechBody(text, model = GEMINI_TTS_MODEL(), voice = GEMINI_TTS_VOICE()) {
  return {
    model,
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
      },
    },
  };
}

const isWav = (bytes) =>
  bytes.length > 12 &&
  bytes.toString("ascii", 0, 4) === "RIFF" &&
  bytes.toString("ascii", 8, 12) === "WAVE";

/** A WAV container around raw little-endian PCM. */
export function pcmToWav(pcm, { sampleRate = 24000, channels = 1, bitsPerSample = 16 } = {}) {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Turns Gemini's inline audio into a file the worker can store and ffmpeg can read. */
export function speechFile(bytes, mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (isWav(bytes) || mime.startsWith("audio/wav") || mime.startsWith("audio/x-wav"))
    return { bytes, contentType: "audio/wav", seconds: null };
  if (!mime || /audio\/l16|codec=pcm|audio\/pcm/.test(mime)) {
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1]) || 24000;
    const channels = Number(/channels=(\d+)/.exec(mime)?.[1]) || 1;
    return {
      bytes: pcmToWav(bytes, { sampleRate: rate, channels }),
      contentType: "audio/wav",
      seconds: bytes.length / (rate * channels * 2),
    };
  }
  return { bytes, contentType: mime.split(";")[0], seconds: null };
}

/** Price of one request from Gemini's own token counts, or from the audio length when missing. */
export function geminiSpeechCost(usage, { text, seconds }) {
  const input =
    Number(usage?.promptTokenCount) || Math.ceil(String(text ?? "").length / 4);
  const output =
    Number(usage?.candidatesTokenCount) ||
    (seconds ? Math.ceil(seconds * AUDIO_TOKENS_PER_SECOND) : 0);
  const usd = (input * USD_PER_M_INPUT() + output * USD_PER_M_OUTPUT()) / 1_000_000;
  return Math.round(usd * 10000) / 10000;
}

export async function synthesizeGeminiSpeech({
  apiKey,
  text,
  fetchImpl = fetch,
}) {
  if (!apiKey) throw new Error("Google API key is required for Gemini TTS");
  const model = GEMINI_TTS_MODEL();
  const voice = GEMINI_TTS_VOICE();
  const response = await fetchImpl(
    `${BASE()}/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiSpeechBody(text, model, voice)),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `gemini tts ${response.status}: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const audio = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const inline = audio?.inlineData ?? audio?.inline_data;
  if (!inline?.data) throw new Error("gemini tts returned no audio");
  const file = speechFile(
    Buffer.from(inline.data, "base64"),
    inline.mimeType ?? inline.mime_type,
  );
  return {
    bytes: file.bytes,
    contentType: file.contentType,
    model,
    voice,
    costUsd: geminiSpeechCost(data.usageMetadata, { text, seconds: file.seconds }),
  };
}
