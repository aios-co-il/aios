/**
 * Talking scenes (scene meta.lipsync): the meta keys a talking scene carries and the line it says,
 * read in one place. Plain TypeScript with no imports, so the board (src/components/workshop)
 * reads scenes the same way. The line is kept in step with public.video_talking_line
 * (supabase/migrations/20261026102300_video_lipsync.sql) and render-worker/src/narration.mjs.
 */

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export interface TalkingMeta {
  /** The scene's character speaks on screen. */
  lipsync: boolean;
  /** What she says (Hebrew); empty falls back to the scene's voiceover. */
  dialogue: string;
  /** Who speaks, for the engine (English). */
  speaker: string;
  /** The line is spoken in the project's chosen voice (the user's own pictures), never the engine's. */
  chosenVoice: boolean;
  /** The cut into the scene switches skin (true or false), else unset. */
  skinSwitch: boolean | null;
}

/** A scene's talking keys from its meta. */
export function talkingMeta(meta: unknown): TalkingMeta {
  const row = record(meta);
  return {
    lipsync: row.lipsync === true,
    dialogue: String(row.dialogue ?? ""),
    speaker: String(row.speaker ?? ""),
    chosenVoice: row.lipsync === true && row.chosen_voice === true,
    skinSwitch: typeof row.skin_switch === "boolean" ? row.skin_switch : null,
  };
}

/** What a talking scene's character says: meta.dialogue, else its voiceover; "" when it does not talk. */
export function talkingLine(meta: unknown, voiceover: unknown): string {
  const row = record(meta);
  if (row.lipsync !== true) return "";
  return String(row.dialogue ?? "").trim() || String(voiceover ?? "").trim();
}

/** The clip already says this line: a lip-synced or talking clip made for exactly it. */
export const clipSaysLine = (clipMeta: unknown, line: string) => {
  const clip = record(clipMeta);
  return (
    clip.lipsync === true && String(clip.dialogue ?? "").trim() === line.trim()
  );
};
