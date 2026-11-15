/**
 * Where a model id is served: its provider, the OpenAI-compatible chat
 * completions URL, the key field of the tenant's "llm" integration, and the
 * model name the provider expects. One mapping for Carmen's chat
 * (run-ai-agent) and the manager round's reads (AIO-592).
 */
export type LlmProvider = "openai" | "google" | "anthropic";

export type LlmKeyField =
  "openai_api_key" | "google_api_key" | "anthropic_api_key";

export type LlmEndpoint = {
  provider: LlmProvider;
  url: string;
  keyField: LlmKeyField;
  model: string;
};

/** The endpoint of a model id ("google/…", "anthropic/…", else OpenAI). */
export function llmEndpoint(modelId: string): LlmEndpoint {
  const id = String(modelId || "");
  const lower = id.toLowerCase();
  if (lower.startsWith("google/") || lower.includes("gemini")) {
    return {
      provider: "google",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      keyField: "google_api_key",
      model: id.replace(/^google\//, ""),
    };
  }
  if (lower.startsWith("anthropic/") || lower.includes("claude")) {
    return {
      provider: "anthropic",
      url: "https://api.anthropic.com/v1/chat/completions",
      keyField: "anthropic_api_key",
      model: id.replace(/^anthropic\//, ""),
    };
  }
  return {
    provider: "openai",
    url: "https://api.openai.com/v1/chat/completions",
    keyField: "openai_api_key",
    model: id.replace(/^openai\//, ""),
  };
}
