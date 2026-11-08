/** A voice Carmen can speak with on ElevenLabs, as the app's voice picker shows it. */
export type ElevenLabsVoice = {
  /** Stable key the app saves and sends back as `voice`. */
  id: string;
  /** The ElevenLabs voice id; the voice must be in the workspace that holds the agent. */
  voiceId: string;
  label: string;
};

/**
 * Carmen's Hebrew voices, the first being the default. David picked them on 7 Nov 2026
 * (AIO-505). The app reads this list, so adding a voice here adds it to the picker.
 */
export const ELEVENLABS_VOICES: ReadonlyArray<ElevenLabsVoice> = [
  { id: "yael", voiceId: "d4eLZ8u5dfBCsjp4YPyz", label: "יעל – חמה ורגועה" },
  {
    id: "danit",
    voiceId: "s0T0DT6EAPeX57MQpn3I",
    label: "דנית – טבעית ושיחתית",
  },
  { id: "zina", voiceId: "Tbj9UQjXon5RB9MPEyc2", label: "זינה – צעירה ורגשית" },
];

/**
 * The voice for an ElevenLabs session: the user's pick, else Carmen's configured voice
 * (`ai_agents.voice`) when it names one of these voices, else the first voice.
 */
export function chooseElevenLabsVoice(
  requested: unknown,
  agentVoice: string | null,
): ElevenLabsVoice {
  return findVoice(requested) ?? findVoice(agentVoice) ?? ELEVENLABS_VOICES[0];
}

/** The voice with this key, or undefined for anything else. */
function findVoice(key: unknown): ElevenLabsVoice | undefined {
  return ELEVENLABS_VOICES.find((voice) => voice.id === key);
}
