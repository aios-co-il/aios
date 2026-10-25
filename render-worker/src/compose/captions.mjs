/** Word timings for karaoke captions, from an ElevenLabs alignment or a word list. */

const MAX_WORDS = 5;
const MAX_GAP_S = 0.5;
const HOLD_S = 0.4;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Words with start/end seconds. Accepts the `/with-timestamps` character alignment
 * ({ characters, character_start_times_seconds, character_end_times_seconds }) or a
 * Scribe-style list ({ words: [{ text|word, start, end }] }). Returns [] for anything else.
 */
export function wordsFromAlignment(alignment) {
  if (!alignment || typeof alignment !== "object") return [];
  if (Array.isArray(alignment.words)) {
    return alignment.words
      .map((word) => ({
        text: String(word?.text ?? word?.word ?? "").trim(),
        start: num(word?.start ?? word?.start_s),
        end: num(word?.end ?? word?.end_s),
      }))
      .filter((w) => w.text && w.start !== null && w.end !== null)
      .map((w) => ({ ...w, end: Math.max(w.start, w.end) }));
  }
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  if (!Array.isArray(chars) || !Array.isArray(starts) || !Array.isArray(ends))
    return [];
  const words = [];
  let current = null;
  for (let i = 0; i < chars.length; i++) {
    const ch = String(chars[i] ?? "");
    const start = num(starts[i]);
    const end = num(ends[i]);
    if (/^\s*$/.test(ch) || start === null || end === null) {
      if (current) words.push(current);
      current = null;
      continue;
    }
    if (!current) current = { text: ch, start, end };
    else {
      current.text += ch;
      current.end = Math.max(current.end, end);
    }
  }
  if (current) words.push(current);
  return words;
}

/** Seconds to film frames, shifted by `offsetFrames` (a scene voice starts at its scene). */
export const wordsToFrames = (words, fps, offsetFrames = 0) =>
  words.map((word) => {
    const startFrame = offsetFrames + Math.round(word.start * fps);
    return {
      text: word.text.slice(0, 40),
      startFrame,
      endFrame: Math.max(
        startFrame + 1,
        offsetFrames + Math.round(word.end * fps),
      ),
    };
  });

/**
 * Groups framed words into short caption lines: at most five words, a new line after a
 * pause or a sentence end. A line holds on screen briefly after its last word.
 */
export function captionChunks(words, fps, endFrame = Infinity) {
  const sorted = [...words]
    .filter((w) => w.startFrame < endFrame)
    .sort((a, b) => a.startFrame - b.startFrame);
  const chunks = [];
  let current = [];
  const flush = () => {
    if (current.length) chunks.push(current);
    current = [];
  };
  for (const word of sorted) {
    const last = current[current.length - 1];
    if (
      last &&
      (current.length >= MAX_WORDS ||
        word.startFrame - last.endFrame > MAX_GAP_S * fps ||
        /[.!?,:;]$/.test(last.text))
    )
      flush();
    current.push(word);
  }
  flush();
  return chunks.map((list, index) => {
    const startFrame = list[0].startFrame;
    const next = chunks[index + 1]?.[0]?.startFrame ?? Infinity;
    const lastEnd = list[list.length - 1].endFrame;
    const end = Math.min(next, lastEnd + Math.round(HOLD_S * fps), endFrame);
    return {
      startFrame,
      endFrame: Math.max(startFrame + 1, end),
      words: list,
    };
  });
}
