import type { Json } from "../_shared/database.types.ts";
import type { ToolDef } from "../_shared/carmen-token-optimizer.ts";
import { isObject, jsonObject } from "./json-config.ts";
import type { JsonRecord } from "./run-request.ts";

/** An OpenAI-compatible tool call as returned in `choices[0].message.tool_calls`. */
export interface ChatToolCall {
  id?: string;
  type?: string;
  function: { name: string; arguments?: unknown };
}

/**
 * An assistant message from an OpenAI-compatible chat completion. It is sent
 * back to the provider as received, so fields not listed here are kept.
 */
export interface ChatCompletionMessage {
  role?: unknown;
  content?: unknown;
  tool_calls?: ChatToolCall[] | null;
}

export type ChatRequestMessage =
  | { role: "system" | "user" | "assistant"; content: Json | undefined }
  | ChatCompletionMessage
  | { role: "tool"; tool_call_id: string | undefined; content: string };

/** The body sent to an OpenAI-compatible `/chat/completions` endpoint. */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatRequestMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{ type: "function"; function: ToolDef }>;
  tool_choice?: { type: "function"; function: { name: string } };
}

function isChatToolCall(value: unknown): value is ChatToolCall {
  if (!isObject(value)) return false;
  if ("id" in value && value.id !== undefined && typeof value.id !== "string")
    return false;
  if (!("function" in value) || !isObject(value.function)) return false;
  return "name" in value.function && typeof value.function.name === "string";
}

export function isChatCompletionMessage(
  value: unknown,
): value is ChatCompletionMessage {
  if (!isObject(value)) return false;
  if (!("tool_calls" in value)) return true;
  const toolCalls = value.tool_calls;
  return (
    toolCalls === undefined ||
    toolCalls === null ||
    (Array.isArray(toolCalls) && toolCalls.every(isChatToolCall))
  );
}

/** `choices[0].message` of a chat completion body, or undefined. */
export function firstChoiceMessage(data: Json): Json | undefined {
  const choices = jsonObject(data).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  return jsonObject(choices[0]).message;
}

function tokenCount(value: Json | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Token usage of a chat completion (OpenAI or Anthropic field names). */
export function readChatUsage(
  data: Json,
): { input: number; output: number } | null {
  const usage = jsonObject(data).usage;
  if (!usage) return null;
  const fields = jsonObject(usage);
  return {
    input:
      tokenCount(fields.prompt_tokens) ?? tokenCount(fields.input_tokens) ?? 0,
    output:
      tokenCount(fields.completion_tokens) ??
      tokenCount(fields.output_tokens) ??
      0,
  };
}

/** Tool arguments from a tool call's JSON `arguments` string; anything else is `{}`. */
export function parseToolArguments(raw: unknown): JsonRecord {
  try {
    const parsed: Json = JSON.parse(String(raw || "{}"));
    return jsonObject(parsed);
  } catch {
    return {};
  }
}

/** The result fields the run loop reads; every tool returns its own shape. */
export interface ToolResultView {
  success?: unknown;
  message?: unknown;
  error?: unknown;
  whatsapp_digest?: unknown;
  sub_task_id?: unknown;
  ui_action?: unknown;
  pending_approval?: unknown;
}

export function readToolResult(value: unknown): ToolResultView {
  if (value === null || typeof value !== "object") return {};
  return {
    success: "success" in value ? value.success : undefined,
    message: "message" in value ? value.message : undefined,
    error: "error" in value ? value.error : undefined,
    whatsapp_digest:
      "whatsapp_digest" in value ? value.whatsapp_digest : undefined,
    sub_task_id: "sub_task_id" in value ? value.sub_task_id : undefined,
    ui_action: "ui_action" in value ? value.ui_action : undefined,
    pending_approval:
      "pending_approval" in value ? value.pending_approval : undefined,
  };
}

/** A tool result as the JSON that supabase-js would serialize for a jsonb column. */
export function toJson(value: unknown): Json | undefined {
  const text = JSON.stringify(value);
  if (text === undefined) return undefined;
  const parsed: Json = JSON.parse(text);
  return parsed;
}
