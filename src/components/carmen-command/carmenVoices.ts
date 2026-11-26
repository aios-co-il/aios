import {
  CARMEN_VOICES,
  type CarmenVoiceOption,
  type CarmenVoiceProvider,
} from "../../../supabase/functions/carmen-realtime-session/voice-list.ts";

/** A voice key the picker saves: an OpenAI voice id or an ElevenLabs voice key. */
export type CarmenVoice = string;

/** One group of the picker: a provider's heading and its voices, in list order. */
export type CarmenVoiceGroup = {
  provider: CarmenVoiceProvider;
  label: string;
  voices: Array<CarmenVoiceOption>;
};

export const DEFAULT_VOICE_LABEL = "קול ברירת מחדל של כרמן";

/** The heading the picker shows above each provider's voices. */
const PROVIDER_LABELS: Record<CarmenVoiceProvider, string> = {
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
};

/**
 * Carmen's live-conversation voices grouped by provider, groups and voices in the order of
 * the server's one list (`CARMEN_VOICES`, AIO-660). A voice added on the server shows up here.
 */
export function carmenVoiceGroups(): Array<CarmenVoiceGroup> {
  const groups = new Map<CarmenVoiceProvider, CarmenVoiceGroup>();

  for (const voice of CARMEN_VOICES) {
    const group = groups.get(voice.provider) ?? {
      provider: voice.provider,
      label: PROVIDER_LABELS[voice.provider],
      voices: [],
    };

    group.voices.push(voice);
    groups.set(voice.provider, group);
  }

  return [...groups.values()];
}

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
