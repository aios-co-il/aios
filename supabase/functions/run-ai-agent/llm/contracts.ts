// ─── Provider failover chain ───
// When the agent's primary provider is out of quota/credit (Gemini spend cap,
// OpenAI credit gone, Anthropic balance low), Carmen automatically retries the
// SAME request against the next provider that has a configured key — so she keeps
// working instead of failing the whole conversation. Only providers whose key
// exists are included; the agent's own engine is always tried first.
import type { LlmProvider } from "../../_shared/llm-endpoint.ts";

export type LLMProvider = LlmProvider;

export interface LLMTarget {
  url: string;
  key: string;
  model: string;
  label: string;
  provider: LLMProvider;
  /** Set for a connected brain (carmen_brain_connections). */
  connectionId?: string;
  /** A connected brain's own settings. */
  temperature?: number;
  maxTokens?: number;
}
