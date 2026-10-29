import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

/** A JSON array of service codes; non-string entries are dropped. */
export const clientServiceListSchema = z
  .array(z.unknown())
  .transform((values) =>
    values.flatMap((value) => {
      const parsed = z.string().safeParse(value);
      return parsed.success ? [parsed.data] : [];
    }),
  );

const jsonTextSchema = z.string().transform((text, ctx) => {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid JSON" });
    return z.NEVER;
  }
});

const clientServicesSchema = z
  .union([
    clientServiceListSchema,
    jsonTextSchema.pipe(clientServiceListSchema),
  ])
  .catch([]);

/** `clients.services` as a list of service codes (stored as a JSON array, legacy rows as a JSON string). */
export function parseClientServices(raw: Json | undefined): string[] {
  return clientServicesSchema.parse(raw);
}
