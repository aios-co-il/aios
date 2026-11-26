import { carmenVoiceGroups, DEFAULT_VOICE_LABEL } from "./carmenVoices";

/** The voice picker's options: Carmen's default, then her voices under one heading per provider. */
export function CarmenVoiceOptions() {
  return (
    <>
      <option value="">{DEFAULT_VOICE_LABEL}</option>
      {carmenVoiceGroups().map((group) => (
        <optgroup key={group.provider} label={group.label}>
          {group.voices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
