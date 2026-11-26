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
