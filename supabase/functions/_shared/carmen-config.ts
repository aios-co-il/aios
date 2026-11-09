import { z } from "npm:zod@3.25.76";

export const CARMEN_SCOPE_MODES = [
  "all",
  "private_only",
  "specific_group",
  "specific_phone",
] as const;

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

const integrationPinSchema = z.string().nullish();

const optionalStrings = z
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
    carmen_integration_id: integrationPinSchema.catch(undefined),
    carmen_scope_mode: z
      .enum([...CARMEN_SCOPE_MODES, "invalid"])
      .optional()
      .catch("invalid"),
    carmen_allowed_group_id: optionalText,
    carmen_allowed_group_ids: optionalStrings,
    carmen_allowed_groups: optionalStrings,
    carmen_allowed_phones: optionalStrings,
    carmen_open_member_groups: z.boolean().optional().catch(false),
    carmen_lid_aliases: lidAliasesSchema.optional(),
    carmen_instructions: optionalText,
    trigger_keyword: optionalText,
    trigger_keywords: optionalStrings,
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

/** Reject malformed pins before parsing can turn them into unpinned automations. */
export function hasValidCarmenIntegrationPin(value: unknown): boolean {
  if (
    !value ||
    typeof value !== "object" ||
    !("carmen_integration_id" in value)
  ) {
    return true;
  }
  return integrationPinSchema.safeParse(value.carmen_integration_id).success;
}

/** Merge stored step overrides after validating both configuration boundaries. */
export function mergeCarmenStepConfig(
  automation: unknown,
  step: unknown,
): CarmenAutomationConfig {
  const stepConfig = Object.fromEntries(
    Object.entries(readCarmenConfig(step)).filter(
      ([, value]) => value !== undefined,
    ),
  );
  return { ...readCarmenConfig(automation), ...stepConfig };
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

/** A deterministic run-ai-agent failure that must not be retried. */
export class PermanentError extends Error {
  /** Preserve the upstream failure detail in webhook logs. */
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

/** Validate the final scope after policy overrides, before routing or session creation. */
export function isValidCarmenScopeMode(
  value: unknown,
): value is (typeof CARMEN_SCOPE_MODES)[number] {
  return CARMEN_SCOPE_MODES.some((mode) => mode === value);
}
