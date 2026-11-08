// ElevenLabs speech to speech (Voice Changer) and forced alignment: a recording said in another
// voice with its delivery kept, and the character timings of a known text in an audio file.
// Request shapes as in ElevenLabs' JS SDK 2.77 (speechToSpeech.convert, forcedAlignment.create).
import type { SpeechAlignment } from "./responses.ts";
import { providerJson } from "./json.ts";
import type { FetchImpl } from "./types.ts";

const BASE = () =>
  (process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io").replace(
    /\/$/,
    "",
  );

/** The speech-to-speech model: the multilingual one, which keeps the language of the recording. */
export const VOICE_CHANGE_MODEL = () =>
  process.env.ELEVENLABS_STS_MODEL || "eleven_multilingual_sts_v2";

/**
 * MP3 at a constant 128 kbps: the take is stored as the narration (as TTS takes are), and its
 * length follows from its size (voiceChangeSeconds), with no probe of a browser recording, whose
 * WebM often states no duration.
 */
export const VOICE_CHANGE_FORMAT = "mp3_44100_128";
const BYTES_PER_SECOND = 128_000 / 8;

/** `audio` said again in `voiceId`, keeping its timing and intonation; MP3 bytes. */
export async function changeVoice({
  apiKey,
  voiceId,
  audio,
  contentType,
  fetchImpl = fetch,
}: {
  apiKey: string;
  voiceId: string;
  audio: Uint8Array;
  contentType: string;
  fetchImpl?: FetchImpl;
}): Promise<Uint8Array> {
  const form = new FormData();
  form.append("audio", new Blob([audio], { type: contentType }), "guide");
  form.append("model_id", VOICE_CHANGE_MODEL());
  // A phone recording carries room noise; the isolation step runs before the voice changes.
  form.append("remove_background_noise", "true");
  const response = await fetchImpl(
    `${BASE()}/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=${VOICE_CHANGE_FORMAT}`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, Accept: "audio/mpeg" },
      body: form,
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `elevenlabs speech to speech ${response.status}: ${detail.slice(0, 300)}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error("elevenlabs speech to speech: empty");
  }
  return bytes;
}

/** Seconds of a take changeVoice returned (constant bitrate). */
export const voiceChangeSeconds = (bytes: Uint8Array) =>
  Math.round((bytes.length / BYTES_PER_SECOND) * 100) / 100;

/** The character timings of `text` in `audio`, in the shape text to speech returns them. */
export async function forceAlign({
  apiKey,
  audio,
  text,
  fetchImpl = fetch,
}: {
  apiKey: string;
  audio: Uint8Array;
  text: string;
  fetchImpl?: FetchImpl;
}): Promise<SpeechAlignment> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/mpeg" }), "take.mp3");
  form.append("text", text);
  const response = await fetchImpl(`${BASE()}/v1/forced-alignment`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
    body: form,
  });
  const data = await providerJson<ForcedAlignment>(response);
  if (!response.ok || !Array.isArray(data.characters)) {
    throw new Error(
      `elevenlabs forced alignment ${response.status}: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  return {
    characters: data.characters.map((char) => String(char?.text ?? "")),
    character_start_times_seconds: data.characters.map((char) =>
      Number(char?.start),
    ),
    character_end_times_seconds: data.characters.map((char) =>
      Number(char?.end),
    ),
  };
}

/** POST /v1/forced-alignment's answer: each character of the text with when it is said. */
interface ForcedAlignment {
  characters: Array<{ text?: string; start?: number; end?: number }>;
}
