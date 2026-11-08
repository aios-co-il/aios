// Zod readers for the agent_tasks.result jsonb checkpoint (written by
// run-agent-task, spawnSubagent and run-ai-agent's task creation).
import { z } from "npm:zod@3.25.76";
import { toolPayloadSchema } from "./tool-wire-value.ts";

const assistantTextSchema = z.object({
  role: z.literal("assistant"),
  content: z.string().refine((text) => text.trim().length > 0),
});

/** Last non-blank assistant message in a stored conversation_history. */
export function lastAssistantContent(history: unknown): string | undefined {
  if (!Array.isArray(history)) {
    return undefined;
  }
  for (let i = history.length - 1; i >= 0; i--) {
    const message = assistantTextSchema.safeParse(history[i]);
    if (message.success) {
      return message.data.content;
    }
  }
  return undefined;
}

/** final_output when present, else the last assistant message of the history. */
export function taskResultOutput(value: unknown): string | undefined {
  const result = readTaskCheckpoint(value);
  if (typeof result.final_output === "string") {
    return result.final_output;
  }
  return lastAssistantContent(result.conversation_history);
}

const whatsAppNotifySchema = z.object({
  surface: z.literal("whatsapp"),
  chat_id: z.string(),
  tenant_id: z.string().catch(""),
  automation_id: z.string().nullable().catch(null),
  connection_user_id: z.string().nullable().catch(null),
  phone_number: z.string().nullable().catch(null),
  is_group: z.boolean().catch(false),
});

/** A stored WhatsApp notify target; only surface and chat_id are required. */
export type WhatsAppNotify = z.infer<typeof whatsAppNotifySchema>;

/** The WhatsApp notify target stored by spawnSubagent / run-ai-agent; null when it is not one. */
export function readWhatsAppNotify(value: unknown): WhatsAppNotify | null {
  const parsed = whatsAppNotifySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const optionalText = z.string().optional().catch(undefined);
const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
});
const checkpointToolSchema = z.object({
  tool: z.string(),
  args: toolPayloadSchema.optional(),
  result: toolPayloadSchema.optional(),
});
const notifyEnvelopeSchema = z
  .object({
    surface: z.string().optional().catch(undefined),
    chat_id: z.string().optional().catch(undefined),
    tenant_id: z.string().optional().catch(undefined),
    automation_id: z.string().nullish().catch(null),
    connection_user_id: z.string().nullish().catch(null),
    phone_number: z.string().nullish().catch(null),
    is_group: z.boolean().catch(false),
  })
  .catch({ is_group: false });
/** Keep the WhatsApp surface even for incomplete targets so delivery fails closed. */
export function readNotifyEnvelope(value: unknown) {
  return notifyEnvelopeSchema.parse(value);
}
const checkpointSchema = z
  .object({
    final_output: optionalText,
    last_output: optionalText,
    error: optionalText,
    last_error: optionalText,
    conversation_history: z
      .array(z.unknown())
      .catch([])
      .transform((rows) =>
        rows.flatMap((row) => {
          const p = historyMessageSchema.safeParse(row);
          return p.success ? [p.data] : [];
        }),
      ),
    total_tool_calls: z.number().nonnegative().optional().catch(undefined),
    tool_log: z.array(checkpointToolSchema).catch([]),
    run_count: z.number().optional().catch(undefined),
    execution_time_ms: z.number().optional().catch(undefined),
    notify: notifyEnvelopeSchema.nullish().catch(null),
    reminder_delivery: z
      .object({ message: z.string() })
      .optional()
      .catch(undefined),
  })
  .catch({ conversation_history: [], tool_log: [] });
export type TaskCheckpoint = z.infer<typeof checkpointSchema>;
/** Known task checkpoint fields, validated before resume or reporting. */
export function readTaskCheckpoint(value: unknown): TaskCheckpoint {
  return checkpointSchema.parse(value);
}
const agentExecutionSchema = z.object({
  output: z.string().catch(""),
  tools_used: z.array(z.string()).catch([]),
  tool_log: z.array(checkpointToolSchema).catch([]),
});
/** The run-ai-agent response consumed when advancing a task checkpoint. */
export function readAgentExecution(value: unknown) {
  return agentExecutionSchema.parse(value);
}
