import { llmEndpoint } from "../../_shared/llm-endpoint.ts";
import type { LLMProvider } from "./contracts.ts";

/** Resolve the provider through the shared endpoint registry. */
export function providerOf(fullId: string): LLMProvider {
  return llmEndpoint(fullId).provider;
}
