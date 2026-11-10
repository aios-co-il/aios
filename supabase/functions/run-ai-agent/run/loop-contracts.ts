import type { LLMTarget } from "../llm/contracts.ts";
import type {
  RunMessage,
  ToolApiEntries,
  ExecutedToolResult,
} from "./contracts.ts";
import type { directDevSendRefusal } from "../dev-task-send-rules.ts";
import type { pulseRefreshToolChoice } from "../pulse-refresh/routing.ts";
export interface CompletionRequest {
  model: string;
  messages: Array<RunMessage>;
  temperature?: number;
  max_tokens?: number;
  tools?: ToolApiEntries;
  stream?: boolean;
  stream_options?: {
    include_usage: boolean;
  };
  tool_choice?: NonNullable<ReturnType<typeof pulseRefreshToolChoice>>;
}
export interface ProviderChainState {
  llmChain: Array<LLMTarget>;
  activeIdx: number;
  extendChain(): Promise<boolean>;
}
export type DevSendTurn = Parameters<typeof directDevSendRefusal>[1];
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
