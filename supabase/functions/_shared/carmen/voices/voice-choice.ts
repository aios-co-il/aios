import { ELEVENLABS_VOICES } from "./elevenlabs-voices.ts";

/**
 * The voices the OpenAI Realtime API speaks, as a voice picker shows them. Every client
 * reads this list (`carmen-realtime-session/voice-list.ts`), so adding a voice here adds it
 * to each picker.
 */
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

/** The ids a Realtime session accepts as its voice. */
export const REALTIME_VOICES = new Set<string>(
  OPENAI_VOICES.map((voice) => voice.id),
);

// The agent settings (ProfileTab) also offer TTS-only voices that Realtime rejects;
// each maps to the closest Realtime voice.
const TTS_ONLY_TO_REALTIME: Record<string, string> = {
  nova: "coral",
  fable: "ballad",
  onyx: "cedar",
};

/**
 * The voice for a live session: the user's pick, else Carmen's configured voice
 * (ai_agents.voice), else marin. Only Realtime voices are returned.
 */
export function chooseRealtimeVoice(
  requested: unknown,
  agentVoice: string | null,
): string {
  if (typeof requested === "string" && REALTIME_VOICES.has(requested)) {
    return requested;
  }
  const mapped = agentVoice
    ? (TTS_ONLY_TO_REALTIME[agentVoice] ?? agentVoice)
    : null;
  return mapped && REALTIME_VOICES.has(mapped) ? mapped : "marin";
}

/**
 * The voices OpenAI text-to-speech (`aiSpeak`, gpt-4o-mini-tts) speaks: every Realtime
 * voice plus the TTS-only ones. `carmen-speak` and WhatsApp voice notes read this set.
 */
export const SPEECH_VOICES = new Set<string>([
  ...REALTIME_VOICES,
  ...Object.keys(TTS_ONLY_TO_REALTIME),
]);

/** The voice a WhatsApp voice note speaks when no candidate can be spoken. */
export const DEFAULT_SPEECH_VOICE = "shimmer";

/** A candidate voice text-to-speech cannot speak, and why. */
export type SkippedSpeechVoice = { voice: string; reason: string };

/** The voice to speak, and each earlier candidate that was passed over. */
export type SpeechVoiceChoice = {
  voice: string;
  skipped: Array<SkippedSpeechVoice>;
};

/**
 * The first candidate text-to-speech can speak (in order, e.g. the line owner's pick,
 * then Carmen's configured voice), else DEFAULT_SPEECH_VOICE. An ElevenLabs voice is
 * passed over: its opus output is not documented as the Ogg file a WhatsApp voice note
 * needs (AIO-654). Empty candidates are no pick and are not reported.
 */
export function chooseSpeechVoice(
  candidates: ReadonlyArray<string | null | undefined>,
): SpeechVoiceChoice {
  const skipped: Array<SkippedSpeechVoice> = [];
  for (const voice of candidates) {
    if (!voice) {
      continue;
    }
    if (SPEECH_VOICES.has(voice)) {
      return { voice, skipped };
    }
    skipped.push({ voice, reason: unspeakableReason(voice) });
  }

  return { voice: DEFAULT_SPEECH_VOICE, skipped };
}

/** Why text-to-speech does not speak this voice. */
function unspeakableReason(voice: string): string {
  if (ELEVENLABS_VOICES.some((option) => option.id === voice)) {
    return "an ElevenLabs voice, whose audio is not confirmed as a WhatsApp voice note";
  }

  return "not a text-to-speech voice (a Realtime-only or unknown id)";
}
