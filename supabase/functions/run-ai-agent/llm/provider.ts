import type { LLMProvider } from "./contracts.ts";

/** Preserves the existing providerOf provider boundary. */
export function providerOf(fullId: string): LLMProvider {
  const l = (fullId || "").toLowerCase();
  if (l.startsWith("google/") || l.includes("gemini")) {
    return "google";
  }
  if (l.startsWith("anthropic/") || l.includes("claude")) {
    return "anthropic";
  }
  return "openai";
}
