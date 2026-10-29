import { z } from "npm:zod@3.25.76";
import type { Json } from "../_shared/database.types.ts";
import type { ToolDef } from "../_shared/carmen-token-optimizer.ts";
import { jsonSchema } from "./run-request.ts";

/** An OpenAI-compatible tool call as returned in `choices[0].message.tool_calls`. */
const chatToolCallSchema = z
  .object({
    id: z.string().optional(),
    function: z
      .object({ name: z.string(), arguments: z.unknown() })
      .passthrough(),
  })
  .passthrough();

/**
 * An assistant message from an OpenAI-compatible chat completion. It is sent
 * back to the provider as received, so fields not listed here are kept.
 */
const chatCompletionMessageSchema = z
  .object({
    role: z.unknown(),
    content: z.unknown(),
    tool_calls: z.array(chatToolCallSchema).nullish(),
  })
  .passthrough();

export type ChatCompletionMessage = z.infer<typeof chatCompletionMessageSchema>;

export type ChatRequestMessage =
  | { role: "system" | "user" | "assistant"; content: unknown }
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

export function readChatCompletionMessage(
  value: unknown,
): ChatCompletionMessage | null {
  const parsed = chatCompletionMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const firstChoiceSchema = z.object({
  choices: z.array(z.object({ message: z.unknown() }).catch({})).nonempty(),
});

/** `choices[0].message` of a chat completion body, or undefined. */
export function firstChoiceMessage(data: unknown): unknown {
  const parsed = firstChoiceSchema.safeParse(data);
  return parsed.success ? parsed.data.choices[0].message : undefined;
}

const tokenCount = z.number().optional().catch(undefined);

const usageFieldsSchema = z
  .object({
    prompt_tokens: tokenCount,
    input_tokens: tokenCount,
    completion_tokens: tokenCount,
    output_tokens: tokenCount,
  })
  .catch({});

const chatUsageSchema = z.object({ usage: z.unknown() }).catch({});

/** Token usage of a chat completion (OpenAI or Anthropic field names). */
export function readChatUsage(
  data: unknown,
): { input: number; output: number } | null {
  const { usage } = chatUsageSchema.parse(data);
  if (!usage) return null;
  const fields = usageFieldsSchema.parse(usage);
  return {
    input: fields.prompt_tokens ?? fields.input_tokens ?? 0,
    output: fields.completion_tokens ?? fields.output_tokens ?? 0,
  };
}

const toolArgumentsSchema = z.record(z.unknown()).catch({});

/** Tool arguments from a tool call's JSON `arguments` string; anything else is `{}`. */
export function parseToolArguments(raw: unknown): Record<string, unknown> {
  try {
    return toolArgumentsSchema.parse(JSON.parse(String(raw || "{}")));
  } catch {
    return {};
  }
}

/** The result fields the run loop reads; every tool returns its own shape. */
const toolResultSchema = z
  .object({
    success: z.unknown(),
    message: z.unknown(),
    error: z.unknown(),
    whatsapp_digest: z.unknown(),
    sub_task_id: z.unknown(),
    ui_action: z.unknown(),
    pending_approval: z.unknown(),
    approval_id: z.unknown(),
    workshop: z.unknown(),
    say_to_user: z.unknown(),
    needs_budget: z.unknown(),
  })
  .catch({});

export type ToolResultView = z.infer<typeof toolResultSchema>;

export function readToolResult(value: unknown): ToolResultView {
  return toolResultSchema.parse(value);
}

/** A tool result as the JSON that supabase-js would serialize for a jsonb column. */
export function toJson(value: unknown): Json | undefined {
  const text = JSON.stringify(value);
  if (text === undefined) return undefined;
  return jsonSchema.parse(JSON.parse(text));
}

const manusTaskSchema = z
  .object({
    task_id: z.unknown(),
    task_url: z.unknown(),
    share_url: z.unknown(),
  })
  .catch({});

/** Manus `create_task` response fields shown to the user. */
export function readManusTask(value: unknown) {
  return manusTaskSchema.parse(value);
}

const errorStackSchema = z.object({ stack: z.unknown() }).catch({});

export function readErrorStack(error: unknown): unknown {
  return errorStackSchema.parse(error).stack;
}
