/**
 * A narration line without its surrounding spaces, tabs and line breaks. The database trims the
 * same set (btrim(x, E' \t\r\n')), so a script built here matches the one it stored.
 */
export function spokenLine(text) {
  return String(text ?? "").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

/** One spoken script, in storyboard order. Blank lines are skipped. */
export function joinNarration(texts) {
  return texts.map(spokenLine).filter(Boolean).join(" ");
}

/** A scene marked lipsync is a character speaking on screen (scene meta.lipsync = true). */
export const isTalkingScene = (scene) => scene?.meta?.lipsync === true;

/**
 * What a talking scene's character says: meta.dialogue, else its voiceover text. Kept in step
 * with public.video_talking_line (supabase/migrations/20261025120000_video_lipsync.sql).
 */
export function talkingLine(scene) {
  if (!isTalkingScene(scene)) return "";
  return spokenLine(scene.meta?.dialogue) || spokenLine(scene.voiceover_text);
}

/**
 * The narrator's line for a scene. A talking scene is spoken by its own clip, so it is left out
 * of the narration (public.video_narration_line) and the film never plays both at once.
 */
export const narrationLine = (scene) =>
  isTalkingScene(scene) ? "" : spokenLine(scene?.voiceover_text);
