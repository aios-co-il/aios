import type { LLMTarget } from "../llm/contracts.ts";
import type { RunMessage, ExecutedToolResult } from "./contracts.ts";

export interface ProviderChainState {
  llmChain: Array<LLMTarget>;
  activeIdx: number;
  extendChain(): Promise<boolean>;
}

export interface ModelToolExecution {
  toolName: string;
  toolArgs: Record<string, unknown>;
  result: ExecutedToolResult;
}

export interface RoundToolState {
  toolResults: Array<RunMessage>;
  pulseDigestShortcut: string | null;
  sayToUser: Array<string>;
  budgetSay: string | null;
}
