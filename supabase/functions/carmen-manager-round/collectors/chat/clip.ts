/**
 * Text cut to a length limit for staff lines and evidence. The limit counts
 * code points, as PostgreSQL's length() does (carmen_findings.summary_he
 * allows 500), and the cut falls between whole characters: an emoji or a
 * joined emoji sequence is kept or dropped whole, never split into a lone
 * surrogate that jsonb rejects.
 */

const SEGMENTER = new Intl.Segmenter("he", { granularity: "grapheme" });

/** `text` when it fits in `max` code points, else its start and "…" within `max`. */
export function clip(text: string, max: number): string {
  if (codePoints(text) <= max) {
    return text;
  }
  let kept = "";
  let used = 0;
  for (const { segment } of SEGMENTER.segment(text)) {
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
