export const LLM_FALLBACK_ORDER = [
  "google/gemini-3-flash-preview",
  "openai/gpt-5.4-mini",
  "anthropic/claude-sonnet-4-6",
];

// The chat's fast lane: quick models that stream, first one the tenant has a key for.
export const FAST_LANE_MODELS = LLM_FALLBACK_ORDER.slice(0, 2);
