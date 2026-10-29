/** Voices the OpenAI Realtime API speaks. */
export const REALTIME_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

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
