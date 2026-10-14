// ElevenLabs sound: per-scene voiceover with word timestamps, and one music bed.
const BASE = () =>
  (process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io").replace(
    /\/$/,
    "",
  );
export const SPEECH_MODEL = () =>
  process.env.ELEVENLABS_TTS_MODEL || "eleven_v4";
export const MUSIC_MODEL = () =>
  process.env.ELEVENLABS_MUSIC_MODEL || "music_v2_5";

export const speechBody = (text, model = SPEECH_MODEL()) => ({
  text,
  model_id: model,
});

export const musicBody = ({
  prompt,
  musicLengthMs,
  model = MUSIC_MODEL(),
}) => ({
  prompt,
  music_length_ms: musicLengthMs,
  model_id: model,
});

const headers = (apiKey) => {
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required");
  return { "xi-api-key": apiKey, "Content-Type": "application/json" };
};

export async function defaultVoiceId(apiKey, fetchImpl = fetch) {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  const response = await fetchImpl(`${BASE()}/v1/voices`, {
    headers: headers(apiKey),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`elevenlabs voices ${response.status}`);
  const voice =
    data.voices?.find((item) => item.category === "premade") ??
    data.voices?.[0];
  if (!voice?.voice_id) throw new Error("ElevenLabs returned no voice");
  return voice.voice_id;
}

export async function synthesizeSpeech({
  apiKey,
  voiceId,
  text,
  fetchImpl = fetch,
}) {
  const id = voiceId || (await defaultVoiceId(apiKey, fetchImpl));
  const response = await fetchImpl(
    `${BASE()}/v1/text-to-speech/${encodeURIComponent(id)}/with-timestamps`,
    {
      method: "POST",
      headers: { ...headers(apiKey), Accept: "application/json" },
      body: JSON.stringify(speechBody(text)),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.audio_base64)
    throw new Error(
      `elevenlabs speech ${response.status}: ${JSON.stringify(data).slice(0, 300)}`,
    );
  return {
    voiceId: id,
    bytes: Buffer.from(data.audio_base64, "base64"),
    alignment: data.alignment ?? null,
  };
}

export async function composeMusic({
  apiKey,
  prompt,
  musicLengthMs,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(`${BASE()}/v1/music`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(musicBody({ prompt, musicLengthMs })),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `elevenlabs music ${response.status}: ${detail.slice(0, 300)}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}
