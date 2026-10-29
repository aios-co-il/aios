import { z } from "npm:zod@3.25.76";
import type { Json } from "../_shared/database.types.ts";

export type JsonRecord = Record<string, unknown>;

export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(jsonSchema),
  ]),
);

const optionalString = z.string().optional().catch(undefined);
const optionalBoolean = z.boolean().optional().catch(undefined);
const optionalRecord = z.record(z.unknown()).optional().catch(undefined);

const jsonRecordSchema = z.record(z.unknown()).catch({});

/** A JSON body read as an object; anything else reads as `{}`. */
export function readJsonRecord(value: unknown): JsonRecord {
  return jsonRecordSchema.parse(value);
}

/** `direct_tool` (carmen-tools-mcp); each field is narrowed where it is used. */
const directToolSchema = z.object({
  action: z.unknown(),
  caller: z.unknown(),
  approval_id: z.unknown(),
  approved_by: z.unknown(),
  name: z.unknown(),
  args: z.record(jsonSchema).catch({}),
});

export type DirectToolRequest = z.infer<typeof directToolSchema>;

/**
 * Delivery target sent by Carmen's WhatsApp webhooks; kept as sent because the
 * chat scope and reminders read its fields one by one.
 */
const waNotifySchema = z
  .object({
    surface: z.unknown(),
    tenant_id: z.unknown(),
    automation_id: z.unknown(),
    connection_user_id: z.unknown(),
    chat_id: z.unknown(),
    phone_number: z.unknown(),
    is_group: z.unknown(),
  })
  .passthrough();

/**
 * A truthy non-string automation_id still marks an automation run
 * (isAutomationRun), so it is kept as text instead of being dropped.
 */
const automationId = z.preprocess(
  (value) =>
    typeof value === "string" || !value ? value || undefined : String(value),
  z.string().optional(),
);

/**
 * The run-ai-agent request body. Known fields of the wrong JSON type read as
 * absent; other fields pass through for the readers that take the raw body.
 */
const runAgentRequestSchema = z
  .object({
    agent_id: optionalString,
    command_text: optionalString,
    temperature: z.number().optional().catch(undefined),
    automation_id: automationId,
    user_name: optionalString,
    lead_data: optionalRecord,
    tenant_id: optionalString,
    user_id: z.string().nullish().catch(undefined),
    task_skills: z
      .array(z.unknown())
      .transform((skills) =>
        skills.filter((skill): skill is string => typeof skill === "string"),
      )
      .optional()
      .catch(undefined),
    task_mode: optionalString,
    conversation_history: z.array(z.unknown()).optional().catch(undefined),
    conversation_id: optionalString,
    wa_notify: waNotifySchema.nullish().catch(undefined),
    model_override: optionalString,
    pin_skills_only: optionalBoolean,
    active_skin: z.unknown(),
    carmen_automation: optionalRecord,
    system_prompt_addon: optionalString,
    context_metadata: optionalRecord,
    stream: optionalBoolean,
    surface: optionalString,
    brain_slug: z.unknown(),
    /** Any truthy direct_tool asks for a direct call (service-only). */
    direct_tool: z.preprocess(
      (value) => (value ? value : undefined),
      directToolSchema.optional().catch({ args: {} }),
    ),
  })
  .passthrough();

export type RunAgentRequest = z.infer<typeof runAgentRequestSchema>;

export function parseRunAgentRequest(value: unknown): RunAgentRequest {
  const parsed = runAgentRequestSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

const embeddedNameSchema = z.object({ name: z.string() });

/** `name` of a row whose select type is unresolved (bad column, ambiguous embed). */
export function embeddedName(value: unknown): string | undefined {
  const parsed = embeddedNameSchema.safeParse(value);
  return parsed.success ? parsed.data.name : undefined;
}

const conversationTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.unknown().transform((content) => String(content || "")),
});

export type ConversationTurn = z.output<typeof conversationTurnSchema>;

const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.unknown(),
});

/** User/assistant entries of the history sent to the model, content as stored. */
export function readHistoryMessages(
  history: unknown[],
): z.output<typeof historyMessageSchema>[] {
  return history.flatMap((entry) => {
    const message = historyMessageSchema.safeParse(entry);
    return message.success ? [message.data] : [];
  });
}

/** User/assistant turns of a stored or client-sent history; other entries are dropped. */
export function readConversationTurns(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const turn = conversationTurnSchema.safeParse(entry);
    return turn.success ? [turn.data] : [];
  });
}
