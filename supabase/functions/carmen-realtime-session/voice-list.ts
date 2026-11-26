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

/**
 * A voice's picker fields without its provider: what each provider's own list holds, and
 * the ElevenLabs-only list reply installed Android apps parse.
 */
type VoiceLabel = Pick<CarmenVoiceOption, "id" | "label">;

/** The body of a `list_voices` reply. */
type VoiceListReply = {
  voices: ReadonlyArray<CarmenVoiceOption | VoiceLabel>;
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
  voices: ReadonlyArray<VoiceLabel>,
  provider: CarmenVoiceProvider,
): Array<CarmenVoiceOption> {
  return voices.map(({ id, label }) => ({ id, label, provider }));
}
