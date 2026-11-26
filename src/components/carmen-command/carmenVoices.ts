import { ELEVENLABS_VOICES } from "../../../supabase/functions/carmen-realtime-session/elevenlabs-voices.ts";
import { OPENAI_VOICES } from "../../../supabase/functions/carmen-realtime-session/voice-choice.ts";
import { CARMEN_VOICES } from "../../../supabase/functions/carmen-realtime-session/voice-list.ts";

/**
 * Carmen's live-conversation voices, owned by the server: `CARMEN_VOICES` is the list every
 * client reads (AIO-660), and the two provider lists are its parts, for the picker's groups.
 * A voice added on the server shows up here too.
 */
export { CARMEN_VOICES, ELEVENLABS_VOICES, OPENAI_VOICES };

/** A voice key the picker saves: an OpenAI voice id or an ElevenLabs voice key. */
export type CarmenVoice = string;

export const VOICE_STORAGE_KEY = "aios:carmen-voice";
export const DEFAULT_VOICE_LABEL = "קול ברירת מחדל של כרמן";

/** The saved or picked voice when it is one of the known voices, else null (Carmen's default). */
export function toCarmenVoice(value: string | null): CarmenVoice | null {
  if (!value) {
    return null;
  }
  return CARMEN_VOICES.some((voice) => voice.id === value) ? value : null;
}

/** Whether the voice runs on ElevenLabs rather than OpenAI Realtime. */
export function isElevenLabsVoice(voice: string | null): boolean {
  return CARMEN_VOICES.some(
    (v) => v.id === voice && v.provider === "elevenlabs",
  );
}
