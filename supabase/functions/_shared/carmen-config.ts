import { z } from "npm:zod@3.25.76";
const aliasPhoneSchema = z.union([
  z.string(),
  z.number().finite().transform(String),
]);

const lidAliasesSchema = z
  .record(z.string(), z.unknown())
  .catch({})
  .transform((entries) => {
    const aliases: { [lid: string]: string } = {};
    for (const [lid, value] of Object.entries(entries)) {
      const phone = aliasPhoneSchema.safeParse(value);
      if (phone.success) aliases[lid] = phone.data;
    }
    return aliases;
  });

const optionalText = z.string().nullish().catch(undefined);
const optionalPhones = z
  .array(z.unknown())
  .transform((entries) =>
    entries.filter((entry): entry is string => typeof entry === "string"),
  )
  .optional()
  .catch(undefined);
const configSchema = z
  .object({
    agent_id: optionalText,
    carmen_connection_user_id: optionalText,
    carmen_integration_id: optionalText,
    carmen_scope_mode: z
      .enum(["all", "specific_group", "specific_phone", "invalid"])
      .optional()
      .catch("invalid"),
    carmen_allowed_group_id: optionalText,
    carmen_allowed_group_ids: optionalPhones,
    carmen_allowed_groups: optionalPhones,
    carmen_allowed_phones: optionalPhones,
    carmen_open_member_groups: z.boolean().optional().catch(false),
    carmen_lid_aliases: lidAliasesSchema.optional(),
    carmen_instructions: optionalText,
    trigger_keyword: optionalText,
    trigger_keywords: optionalPhones,
    end_keyword: optionalText,
    session_timeout_minutes: z
      .union([
        z.number().finite(),
        z
          .string()
          .regex(/^\d+(\.\d+)?$/)
          .transform(Number),
      ])
      .optional()
      .catch(undefined),
    green_api_integration_id: optionalText,
    meta_whatsapp_integration_id: optionalText,
    integration_id: optionalText,
  })
  .catch({});
export type CarmenAutomationConfig = z.infer<typeof configSchema>;
/** Validate only the configuration fields used by Carmen routing and sessions. */
export function readCarmenConfig(value: unknown): CarmenAutomationConfig {
  return configSchema.parse(value);
}
/** Merge stored step overrides after validating both configuration boundaries. */
export function mergeCarmenStepConfig(
  automation: unknown,
  step: unknown,
): CarmenAutomationConfig {
  return { ...readCarmenConfig(automation), ...readCarmenConfig(step) };
}
const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type ChatTurn = z.infer<typeof chatTurnSchema>;

export function isChatTurn(turn: unknown): turn is ChatTurn {
  return chatTurnSchema.safeParse(turn).success;
}

const phoneEntrySchema = z.object({ phone: z.string() });

/** Policy phone entries are already parsed when the first one carries a string phone. */
export function policyEntriesAreParsed(entries: unknown): boolean {
  return (
    Array.isArray(entries) && phoneEntrySchema.safeParse(entries[0]).success
  );
}

const permanentErrorSchema = z.object({ permanent: z.boolean() });

/** A thrown value flagged `permanent` (a 4xx from run-ai-agent) is not retried. */
export function isPermanentError(e: unknown): boolean {
  const parsed = permanentErrorSchema.safeParse(e);
  return parsed.success && parsed.data.permanent;
}
