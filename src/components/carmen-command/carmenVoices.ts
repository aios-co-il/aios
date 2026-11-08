import { ELEVENLABS_VOICES } from "../../../supabase/functions/carmen-realtime-session/elevenlabs-voices.ts";

/** OpenAI Realtime voices for Carmen's live conversation. */
export const OPENAI_VOICES = [
  { id: "marin", label: "Marin — טבעי וחם" },
  { id: "cedar", label: "Cedar — עמוק ובטוח" },
  { id: "coral", label: "Coral — בהיר וידידותי" },
  { id: "sage", label: "Sage — רגוע ומאוזן" },
  { id: "shimmer", label: "Shimmer — רך ונעים" },
  { id: "alloy", label: "Alloy — ניטרלי ומדויק" },
  { id: "ash", label: "Ash — יציב וישיר" },
  { id: "ballad", label: "Ballad — עשיר והבעתי" },
  { id: "echo", label: "Echo — חד ואנרגטי" },
  { id: "verse", label: "Verse — דינמי ושיחתי" },
] as const;

/**
 * Carmen's ElevenLabs voices (AIO-505), the same list the Android app's picker reads, so a voice
 * added on the server shows up here too.
 */
export { ELEVENLABS_VOICES };

/** A voice key the picker saves: an OpenAI voice id or an ElevenLabs voice key. */
export type CarmenVoice = string;

export const VOICE_STORAGE_KEY = "aios:carmen-voice";
export const DEFAULT_VOICE_LABEL = "קול ברירת מחדל של כרמן";

/** The saved or picked voice when it is one of the known voices, else null (Carmen's default). */
export function toCarmenVoice(value: string | null): CarmenVoice | null {
  if (!value) {
    return null;
  }
  const known =
    OPENAI_VOICES.some((voice) => voice.id === value) ||
    isElevenLabsVoice(value);
  return known ? value : null;
}

/** Whether the voice runs on ElevenLabs rather than OpenAI Realtime. */
export function isElevenLabsVoice(voice: string | null): boolean {
  return ELEVENLABS_VOICES.some((v) => v.id === voice);
}
