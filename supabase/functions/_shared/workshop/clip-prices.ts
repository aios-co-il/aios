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
