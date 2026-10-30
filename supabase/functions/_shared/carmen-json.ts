// Zod readers for Carmen's JSON columns (automation configuration and session
// conversation_history), which are untyped `Json` in the generated schema.
import { z } from "npm:zod@3.25.76";
import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

const jsonValueSchema: z.ZodType<Json> = z.lazy(() =>
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

/** A JSON value as an object, or null for null, arrays and scalars. */
export function jsonObjectOrNull(value: Json | undefined): JsonObject | null {
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** A JSON value read as an object; null, arrays and scalars read as empty. */
export function asJsonObject(value: Json | undefined): JsonObject {
  return jsonObjectOrNull(value) ?? {};
}

const jsonStringSchema = z.string().nullable().catch(null);

export function jsonString(value: Json | undefined): string | null {
  return jsonStringSchema.parse(value);
}

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

/** Carmen automation configuration (trigger step merged over automation). */
export type CarmenAutomationConfig = JsonObject & {
  carmen_lid_aliases?: z.infer<typeof lidAliasesSchema>;
};

/** Keeps string and finite-number LID alias entries (numbers as strings). */
export function toCarmenAutomationConfig(
  config: JsonObject,
): CarmenAutomationConfig {
  const { carmen_lid_aliases: rawAliases, ...rest } = config;
  if (rawAliases === undefined) return rest;
  return { ...rest, carmen_lid_aliases: lidAliasesSchema.parse(rawAliases) };
}

/** The trigger step's configuration merged over the automation's own. */
export function mergeCarmenStepConfig(
  automationConfig: Json | undefined,
  stepConfig: JsonObject,
): CarmenAutomationConfig {
  return toCarmenAutomationConfig({
    ...asJsonObject(automationConfig),
    ...stepConfig,
  });
}

/** A field of a JSON value; null, arrays and scalars have no fields. */
export function jsonField(
  value: Json | undefined,
  key: string,
): Json | undefined {
  return asJsonObject(value)[key];
}

const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type ChatTurn = z.infer<typeof chatTurnSchema>;

export function isChatTurn(turn: Json): turn is ChatTurn {
  return chatTurnSchema.safeParse(turn).success;
}

const phoneEntrySchema = z.object({ phone: z.string() });

/** Policy phone entries are already parsed when the first one carries a string phone. */
export function policyEntriesAreParsed(entries: unknown): boolean {
  return (
    Array.isArray(entries) && phoneEntrySchema.safeParse(entries[0]).success
  );
}

const permanentErrorSchema = z.object({ permanent: z.unknown() });

/** A thrown value flagged `permanent` (a 4xx from run-ai-agent) is not retried. */
export function isPermanentError(e: unknown): boolean {
  const parsed = permanentErrorSchema.safeParse(e);
  return parsed.success && Boolean(parsed.data.permanent);
}
