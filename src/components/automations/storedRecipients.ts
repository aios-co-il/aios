import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

export type UnsupportedRecipient = { type: "unsupported"; raw: Json };

export type RecipientSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

export const idTextSchema = z.union([
  z.string(),
  z.number().finite().transform(String),
]);

export const contactLookupRecipientSchema = z.object({
  type: z.literal("contact_lookup"),
  entity: z.enum(["lead", "client"]),
  id: idTextSchema,
});

const unsupportedRecipientSchema = z.object({
  type: z.literal("unsupported"),
  raw: z.custom<Json>(),
});

export function isUnsupportedRecipient(
  entry: unknown,
): entry is UnsupportedRecipient {
  return unsupportedRecipientSchema.safeParse(entry).success;
}

export function parseStoredRecipients<T>(
  entries: Json[],
  schema: RecipientSchema<T>,
): Array<T | UnsupportedRecipient> {
  return entries.map((raw) => {
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : { type: "unsupported", raw };
  });
}

export function toStoredRecipients<T extends Json>(
  entries: Array<T | UnsupportedRecipient>,
): Json[] {
  return entries.map((entry) =>
    isUnsupportedRecipient(entry) ? entry.raw : entry,
  );
}
