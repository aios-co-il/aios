import {
  DEFAULT_VOICE_LABEL,
  ELEVENLABS_VOICES,
  OPENAI_VOICES,
} from "./carmenVoices";

/** The voice picker's options: Carmen's default, her ElevenLabs voices, then OpenAI's. */
export function CarmenVoiceOptions() {
  return (
    <>
      <option value="">{DEFAULT_VOICE_LABEL}</option>
      <optgroup label="ElevenLabs">
        {ELEVENLABS_VOICES.map((voice) => (
          <option key={voice.id} value={voice.id}>
            {voice.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="OpenAI">
        {OPENAI_VOICES.map((voice) => (
          <option key={voice.id} value={voice.id}>
            {voice.label}
          </option>
        ))}
      </optgroup>
    </>
  );
}
