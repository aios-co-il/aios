/**
 * Planning rates for the video engines, shared by the workshop quote and the video page's
 * estimate so both show the same number. The render worker keeps its own env-overridable copy.
 */
export const KLING_USD_PER_5S = 0.85;
export const KLING_CREDITS_PER_5S = 5100;
export const ELEVENLABS_VIDEO_USD_PER_SECOND = 0.15;
export const HIGGSFIELD_USD_PER_SECOND = 0.1;
/** OpenRouter kwaivgi/kling-v3.0-std, 720p without audio. */
export const OPENROUTER_USD_PER_SECOND = 0.084;
export const VOICE_USD_PER_1000_CHARS = 0.12;
/**
 * The render worker adds nikud to a plain Hebrew line before the voice engine (render-worker
 * src/jobs/vocalize.ts), and ElevenLabs bills the pointed text it is sent: 1.45–1.8× the
 * plain length on real scripts. The quote prices the upper end.
 */
export const NIKUD_CHARACTER_FACTOR = 1.7;
export const MUSIC_USD_PER_MINUTE = 0.5;

/**
 * The music bed is made for the film that will be rendered, not the planned scenes
 * (render-worker src/jobs/music-length.ts): the narration can stretch the scenes, and the end
 * card and a tail follow them. The quote prices that upper bound: the planned seconds with 15%
 * headroom, plus 8.5 s for the longest end card (4.5 s with a three-line call to action) and the
 * 4 s tail. The worker never asks for more than the run's quote.
 */
export const MUSIC_HEADROOM = 0.15;
export const MUSIC_EXTRA_S = 8.5;

/** Seconds of music a storyboard of `plannedS` seconds is quoted for. */
export const musicQuoteSeconds = (plannedS: number) =>
  plannedS > 0 ? plannedS * (1 + MUSIC_HEADROOM) + MUSIC_EXTRA_S : 0;

/**
 * The characters the voice engine is billed for a line. A Hebrew line with any word not yet
 * pointed is sent with nikud, so it is priced at NIKUD_CHARACTER_FACTOR times its length.
 */
export function voiceCharacters(line: string): number {
  const text = line.trim();
  return getsNikud(text)
    ? Math.ceil(text.length * NIKUD_CHARACTER_FACTOR)
    : text.length;
}

// Copy of the render worker's rule (render-worker/src/jobs/nikud.ts isVocalized): the worker
// cannot import edge code, so change both together. A point is a vowel, dagesh, shin/sin dot or
// cantillation; maqaf (U+05BE), paseq (U+05C0) and sof pasuq (U+05C3) are punctuation.
const HEBREW_LETTER = /[\u05D0-\u05EA]/;
const POINTED_LETTER =
  /[\u05D0-\u05EA][\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/;

/** True when the worker would add nikud: some Hebrew word has no pointed letter. */
const getsNikud = (text: string) =>
  text
    .split(/\s+/)
    .some((word) => HEBREW_LETTER.test(word) && !POINTED_LETTER.test(word));
