/**
 * Cuts a film narrated in one continuous take so each scene starts when its own line starts.
 * The take's word timings come from the TTS alignment, and the take is the scenes' lines joined
 * in order (render.mjs), so counting words finds where each line begins. Returns null when a
 * scene has no line or the words do not add up; the caller then stretches the scenes evenly.
 */

const wordCount = (text) =>
  String(text ?? "")
    .split(/\s+/)
    .filter(Boolean).length;

/**
 * lines: each scene's narration text, in film order. words: the take's framed words.
 * minFrames: each scene's own shortest length. takeFrames: the take's length with its tail.
 */
export function lineFrames(lines, words, minFrames, takeFrames) {
  if (!lines.length || !words.length) return null;
  const counts = lines.map(wordCount);
  if (counts.some((count) => count === 0)) return null;
  if (counts.reduce((sum, count) => sum + count, 0) !== words.length)
    return null;
  const starts = [];
  let at = 0;
  for (const count of counts) {
    starts.push(at === 0 ? 0 : words[at].startFrame);
    at += count;
  }
  const frames = starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : takeFrames;
    return end - start;
  });
  // A line spoken too fast for its scene cannot shorten the scene below 15 frames.
  if (frames.some((count) => count < 15)) return null;
  const last = frames.length - 1;
  frames[last] = Math.max(frames[last], minFrames[last] ?? 0);
  return frames;
}
