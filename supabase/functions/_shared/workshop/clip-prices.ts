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
export const MUSIC_USD_PER_MINUTE = 0.5;

/**
 * The music bed is made for the film that will be rendered, not the planned scenes
 * (render-worker src/jobs/music-length.mjs): the narration can stretch the scenes, and the end
 * card and a tail follow them. The quote prices that upper bound: the planned seconds with 15%
 * headroom, plus 8.5 s for the longest end card (4.5 s with a three-line call to action) and the
 * 4 s tail. The worker never asks for more than the run's quote.
 */
export const MUSIC_HEADROOM = 0.15;
export const MUSIC_EXTRA_S = 8.5;

/** Seconds of music a storyboard of `plannedS` seconds is quoted for. */
export const musicQuoteSeconds = (plannedS: number) =>
  plannedS > 0 ? plannedS * (1 + MUSIC_HEADROOM) + MUSIC_EXTRA_S : 0;
