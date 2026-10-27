/**
 * Text on one line within a length limit, for the card line, items, quotes
 * and the staff line. The limit counts code points, as PostgreSQL's length()
 * does, and the cut falls between whole characters: an emoji is kept or
 * dropped whole, never split into a lone surrogate that jsonb rejects (which
 * would fail the finding upsert and the whole run).
 */

const SEGMENTER = new Intl.Segmenter("he", { granularity: "grapheme" });

/** Whitespace collapsed; when longer than `max`, its start and "…" within `max`. */
export function clamp(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (codePoints(line) <= max) {
    return line;
  }
  let kept = "";
  let used = 0;
  for (const { segment } of SEGMENTER.segment(line)) {
    const size = codePoints(segment);
    if (used + size > max - 1) {
      break;
    }
    kept += segment;
    used += size;
  }
  return `${kept}…`;
}

/** Length in code points (a surrogate pair counts once). */
function codePoints(text: string): number {
  return Array.from(text).length;
}
