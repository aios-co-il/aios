/**
 * The kicker: a scene's own short title shown at the top of the frame while karaoke captions run
 * at the bottom (workshop-film.tsx). The Remotion manifest sets it per scene; the ffmpeg edit
 * draws its bottom titles instead.
 */

/**
 * A kicker title stays this short. render-job.mjs (workers/creative-video/remotion) cuts a
 * kicker at the same 32 characters.
 */
export const KICKER_MAX_WORDS = 5;
export const KICKER_MAX_CHARS = 32;

/** Words for comparing a title with a spoken line: no niqqud, punctuation or case. */
const plainWords = (text) =>
  String(text ?? "")
    .normalize("NFC")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

const contains = (outer, inner) =>
  ` ${outer.join(" ")} `.includes(` ${inner.join(" ")} `);

/**
 * The scene's title to show as a kicker above karaoke captions ("אנליסטית", "SEO ו-GEO"), or
 * null: only a short title (at most five words and 32 characters) that is not just the scene's
 * spoken line again. A title that is most of the line, or the whole line, would only repeat
 * the captions under it.
 */
export function kickerTitle(caption, line = "") {
  const text = String(caption ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.length > KICKER_MAX_CHARS) return null;
  if (text.split(" ").length > KICKER_MAX_WORDS) return null;
  const title = plainWords(text);
  if (!title.length) return null;
  const spoken = plainWords(line);
  if (
    spoken.length &&
    (contains(title, spoken) ||
      (contains(spoken, title) && title.length * 5 >= spoken.length * 3))
  )
    return null;
  return text;
}
