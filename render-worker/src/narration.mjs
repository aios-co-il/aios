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
