import { ELEVENLABS_VOICES } from "./elevenlabs-voices.ts";
import { OPENAI_VOICES } from "./voice-choice.ts";

/** Who speaks a voice, and so which kind of session a client opens for it. */
export type CarmenVoiceProvider = "openai" | "elevenlabs";

/** A voice as a picker shows it; `id` is what the client saves and sends back as `voice`. */
export type CarmenVoiceOption = {
  id: string;
  label: string;
  provider: CarmenVoiceProvider;
};

/** A voice in the ElevenLabs-only list reply, the shape installed Android apps parse. */
type ElevenLabsVoiceOption = { id: string; label: string };

/** The body of a `list_voices` reply. */
export type VoiceListReply = {
  voices: ReadonlyArray<CarmenVoiceOption | ElevenLabsVoiceOption>;
};

/**
 * Every voice Carmen can speak in a live conversation, in picker order: her Hebrew
 * ElevenLabs voices first, then the OpenAI Realtime ones. Each list stays in its own module
 * (`elevenlabs-voices.ts`, `voice-choice.ts`), so adding a voice there adds it here.
 */
export const CARMEN_VOICES: ReadonlyArray<CarmenVoiceOption> = [
  ...withProvider(ELEVENLABS_VOICES, "elevenlabs"),
  ...withProvider(OPENAI_VOICES, "openai"),
];

/**
 * The reply to `list_voices: true`. With `provider: "elevenlabs"` it is the ElevenLabs
 * voices as `{ id, label }` only: Android apps installed before AIO-660 send that and add
 * their own OpenAI entry, so that shape is frozen. Any other request gets the whole list.
 */
export function voiceListReply(provider: unknown): VoiceListReply {
  if (provider === "elevenlabs") {
    return {
      voices: ELEVENLABS_VOICES.map(({ id, label }) => ({ id, label })),
    };
  }
  return { voices: CARMEN_VOICES };
}

/** The picker fields of each voice, tagged with its provider. */
function withProvider(
  voices: ReadonlyArray<{ id: string; label: string }>,
  provider: CarmenVoiceProvider,
): Array<CarmenVoiceOption> {
  return voices.map(({ id, label }) => ({ id, label, provider }));
}
