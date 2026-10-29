// Zod readers for the agent_tasks.result jsonb checkpoint (written by
// run-agent-task, spawnSubagent and run-ai-agent's task creation).
import { z } from "npm:zod@3.25.76";
import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

export const jsonValueSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

/** The value as a JSON object, or null for null, arrays and scalars. */
export function jsonObjectOrNull(value: unknown): JsonObject | null {
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The value itself when it is a JSON object, otherwise an empty object. */
export function asJsonObject(value: unknown): JsonObject {
  return jsonObjectOrNull(value) ?? {};
}

const assistantTextSchema = z.object({
  role: z.literal("assistant"),
  content: z.string().refine((text) => text.trim().length > 0),
});

/** Last non-blank assistant message in a stored conversation_history. */
export function lastAssistantContent(
  history: Json | undefined,
): string | undefined {
  if (!Array.isArray(history)) return undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    const message = assistantTextSchema.safeParse(history[i]);
    if (message.success) return message.data.content;
  }
  return undefined;
}

/** final_output when present, else the last assistant message of the history. */
export function taskResultOutput(result: JsonObject): string | undefined {
  if (typeof result.final_output === "string") return result.final_output;
  return lastAssistantContent(result.conversation_history);
}

const whatsAppNotifySchema = z.object({
  surface: z.literal("whatsapp"),
  chat_id: z.string(),
  tenant_id: z.string().catch(""),
  automation_id: z.string().nullable().catch(null),
  connection_user_id: z.string().nullable().catch(null),
  phone_number: z.string().nullable().catch(null),
  is_group: z.unknown().transform(Boolean),
});

/** A stored WhatsApp notify target; only surface and chat_id are required. */
export type WhatsAppNotify = z.infer<typeof whatsAppNotifySchema>;

/** The WhatsApp notify target stored by spawnSubagent / run-ai-agent; null when it is not one. */
export function readWhatsAppNotify(value: unknown): WhatsAppNotify | null {
  const parsed = whatsAppNotifySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
