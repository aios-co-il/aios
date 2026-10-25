// Gemini speech. The unary response is a WAV file in inlineData, and Hebrew is detected
// from the transcript. Style stays out of the spoken text so it is not read aloud.
export const GEMINI_TTS_MODEL = () =>
  process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";

const BASE = () =>
  (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com").replace(
    /\/$/,
    "",
  );

export function geminiSpeechBody(text, model = GEMINI_TTS_MODEL()) {
  return {
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text,
            speech_metadata: { style: "calm commercial narration" },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { voice: "Kore" } },
    },
  };
}

export async function synthesizeGeminiSpeech({
  apiKey,
  text,
  fetchImpl = fetch,
}) {
  if (!apiKey) throw new Error("Google API key is required for Gemini TTS");
  const model = GEMINI_TTS_MODEL();
  const response = await fetchImpl(
    `${BASE()}/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiSpeechBody(text, model)),
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
  const b64 = audio?.inlineData?.data ?? audio?.inline_data?.data;
  if (!b64) throw new Error("gemini tts returned no audio");
  return {
    bytes: Buffer.from(b64, "base64"),
    model,
    contentType: "audio/wav",
  };
}
