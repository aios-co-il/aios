/**
 * Motion-graphic captions ("kinetic typography") for the Workshop film: the narration's words in
 * phrases of two to four, at most two lines, each word entering as it is spoken. One word of a
 * phrase is its key word (a number, the brand, a word of the scene's title, an emphatic word),
 * drawn larger in the accent colour. workshop-motion-captions.tsx (workers/creative-video/
 * remotion) draws them; the karaoke lines of captions.mjs stay available for older films.
 */
import {
  displayWord,
  isLtrWord,
  keyScore,
  leansOnNext,
  wordsOf,
} from "./motion-words.mjs";

export { displayWord, isLtrWord, keyScore, wordsOf } from "./motion-words.mjs";

/** The film's caption style: karaoke only when asked for (payload.video.caption_style). */
export const captionStyleOf = (value) =>
  value === "karaoke" ? "karaoke" : "motion";

const MAX_WORDS = 4;
/** A pause this long ends a phrase. */
const PAUSE_S = 0.35;
/** A phrase stays a moment after its last word. */
const HOLD_S = 0.35;

/** Characters per caption line before a phrase takes two lines, by frame shape. */
const LINE_CHARS = { "9:16": 15, "4:5": 18, "1:1": 17, "16:9": 30 };
export const lineCharsFor = (aspect) =>
  LINE_CHARS[aspect] ?? LINE_CHARS["9:16"];

/** A key word is drawn this much larger (workshop-layout.ts KEY_SCALE). */
const KEY_WIDTH = 1.3;

/**
 * Where a clause of `words` breaks into phrases: two to four words each (one only for a
 * one-word clause), as few phrases as fit, balanced, and not ending on a word that leans on the
 * next ("מנהלת השיווק | של העסק שלך"). Returns the phrase sizes.
 */
export function phraseSizes(words) {
  const n = words.length;
  if (n <= MAX_WORDS) return n ? [n] : [];
  const leans = words.map(leansOnNext);
  const fewest = Math.ceil(n / MAX_WORDS);
  let best = null;
  for (const k of [fewest, fewest + 1]) {
    const mean = n / k;
    // cost[i][g]: the best split of the first i words into g phrases.
    const cost = Array.from({ length: n + 1 }, () =>
      Array(k + 1).fill(Infinity),
    );
    const from = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0));
    cost[0][0] = 0;
    for (let g = 1; g <= k; g++)
      for (let i = 2; i <= n; i++)
        for (let size = 2; size <= Math.min(MAX_WORDS, i); size++) {
          const prev = cost[i - size][g - 1];
          if (prev === Infinity) continue;
          const lean = i < n && leans[i - 1] ? 3 : 0;
          const value = prev + lean + (size - mean) ** 2;
          if (value < cost[i][g]) {
            cost[i][g] = value;
            from[i][g] = size;
          }
        }
    // One more phrase than needed only when it avoids a leaning end.
    const total = cost[n][k] + (k - fewest);
    if (total < (best?.total ?? Infinity)) {
      const sizes = [];
      for (let i = n, g = k; g > 0; g--) {
        sizes.unshift(from[i][g]);
        i -= from[i][g];
      }
      best = { total, sizes };
    }
  }
  return best?.sizes ?? [n];
}

/** Splits a phrase into one or two lines, balanced by width: which line each word is on. */
export function phraseLines(widths, maxLineChars) {
  const gaps = widths.length - 1;
  const total = widths.reduce((sum, w) => sum + w, 0) + gaps;
  if (widths.length < 2 || total <= maxLineChars) return widths.map(() => 0);
  let best = 1;
  let bestWidth = Infinity;
  for (let cut = 1; cut < widths.length; cut++) {
    const first = widths.slice(0, cut).reduce((s, w) => s + w, 0) + cut - 1;
    const widest = Math.max(first, total - first - 1);
    if (widest < bestWidth) {
      bestWidth = widest;
      best = cut;
    }
  }
  return widths.map((_, index) => (index < best ? 0 : 1));
}

/**
 * The sorted words as clauses: a sentence end, a pause or a cut (`cuts`) is a hard break, a
 * comma or a dash a soft one. A word with nothing to show (a dash) only breaks softly. A single
 * word next to a soft break joins its neighbour when the phrase stays short.
 */
function clausesOf(sorted, { cuts, fps }) {
  const clauses = [];
  let current = [];
  let pendingSoft = false;
  let previous = null;
  for (const word of sorted) {
    const shown = displayWord(word.text);
    if (!shown) {
      if (current.length) pendingSoft = true;
      continue;
    }
    if (previous && current.length) {
      const said = previous.text.trim();
      const hard =
        cuts.some((f) => previous.startFrame < f && f <= word.startFrame) ||
        /[.!?…]["'”)]*$/.test(said) ||
        word.startFrame - previous.endFrame > PAUSE_S * fps;
      const soft = pendingSoft || /[,;:—–]["'”)]*$/.test(said);
      if (hard || soft) {
        clauses.push({ words: current, after: hard ? "hard" : "soft" });
        current = [];
      }
    }
    pendingSoft = false;
    current.push({ ...word, shown });
    previous = word;
  }
  if (current.length) clauses.push({ words: current, after: "hard" });
  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    if (clause.words.length !== 1) continue;
    const before = clauses[i - 1];
    const next = clauses[i + 1];
    if (before?.after === "soft" && before.words.length < MAX_WORDS) {
      before.words.push(...clause.words);
      before.after = clause.after;
    } else if (next && clause.after === "soft" && next.words.length < MAX_WORDS)
      next.words.unshift(...clause.words);
    else continue;
    clauses.splice(i, 1);
    i -= 1;
  }
  return clauses.map((clause) => clause.words);
}

/** A clause of words in phrases (phraseSizes). */
function splitClause(words) {
  const groups = [];
  let at = 0;
  for (const size of phraseSizes(words.map((word) => word.shown))) {
    groups.push(words.slice(at, at + size));
    at += size;
  }
  return groups;
}

/**
 * Framed words ({ text, startFrame, endFrame }) as motion captions: phrases of two to four words
 * that never span a sentence end, a pause or a scene cut (`breaks`, the scenes' start frames).
 * Each phrase lasts from its first word until the next phrase (or a short hold after its last
 * word) and marks at most one key word, the strongest by keyScore. Words carry their line
 * (0 or 1), `key` and `ltr` (see isLtrWord).
 *
 * `scenes` ([{ startFrame, title }]) gives each word its scene's title for keyScore.
 */
export function motionCaptions(
  words,
  {
    fps,
    endFrame = Infinity,
    breaks = [],
    scenes = [],
    brand = "",
    maxLineChars = LINE_CHARS["9:16"],
  },
) {
  const titles = [...scenes]
    .sort((a, b) => a.startFrame - b.startFrame)
    .map((scene) => ({
      startFrame: scene.startFrame,
      words: wordsOf(scene.title),
    }));
  const brandWords = wordsOf(brand);
  const titleAt = (frame) =>
    titles.filter((scene) => scene.startFrame <= frame).at(-1)?.words ?? [];
  const sorted = [...words]
    .filter((w) => w.startFrame < endFrame)
    .sort((a, b) => a.startFrame - b.startFrame);
  const phrases = clausesOf(sorted, {
    cuts: [...breaks].sort((a, b) => a - b),
    fps,
  }).flatMap(splitClause);
  return phrases.map((list, index) => {
    const startFrame = list[0].startFrame;
    const next = phrases[index + 1]?.[0]?.startFrame ?? Infinity;
    const lastEnd = list[list.length - 1].endFrame;
    const end = Math.min(next, lastEnd + Math.round(HOLD_S * fps), endFrame);
    const title = titleAt(startFrame);
    let key = -1;
    let keyBest = 0;
    for (const [i, word] of list.entries()) {
      const score = keyScore(word.shown, { title, brand: brandWords });
      if (score > keyBest) {
        keyBest = score;
        key = i;
      }
    }
    const lines = phraseLines(
      list.map(
        (word, i) => [...word.shown].length * (i === key ? KEY_WIDTH : 1),
      ),
      maxLineChars,
    );
    return {
      startFrame,
      endFrame: Math.max(startFrame + 1, end),
      words: list.map((word, i) => ({
        text: word.shown.slice(0, 40),
        startFrame: word.startFrame,
        endFrame: word.endFrame,
        line: lines[i],
        ...(i === key ? { key: true } : {}),
        ...(isLtrWord(word.shown) ? { ltr: true } : {}),
      })),
    };
  });
}
