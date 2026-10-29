import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

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

/** The settings object stored on a tenant_integrations row, or `{}` when it is not an object. */
export function integrationSettingsObject(
  settings: Json | null | undefined,
): JsonObject {
  const parsed = jsonObjectSchema.safeParse(settings);
  return parsed.success ? parsed.data : {};
}

const optionalString = z.string().optional().catch(undefined);

const manusWaSettingsSchema = z
  .object({
    instance_id: optionalString,
    webhook_secret: optionalString,
    country_code: optionalString,
    status: optionalString,
    phone_number: optionalString,
  })
  .catch({});

export type ManusWaSettings = z.infer<typeof manusWaSettingsSchema>;

/** String fields the Manus WhatsApp settings UI reads; non-string values are treated as missing. */
export function readManusWaSettings(
  settings: Json | null | undefined,
): ManusWaSettings {
  return manusWaSettingsSchema.parse(settings);
}

const manusOutputSchema = z.array(z.unknown());
const manusOutputItemSchema = z.object({ content: z.array(z.unknown()) });
const manusOutputTextPartSchema = z.object({
  type: z.literal("output_text"),
  text: z.unknown(),
});

/** Concatenated `output_text` parts of a Manus task output, or null when there are none. */
export function manusOutputText(
  output: Json | null | undefined,
): string | null {
  const items = manusOutputSchema.safeParse(output);
  if (!items.success) return null;
  const texts: string[] = [];
  for (const rawItem of items.data) {
    const item = manusOutputItemSchema.safeParse(rawItem);
    if (!item.success) continue;
    for (const rawPart of item.data.content) {
      const part = manusOutputTextPartSchema.safeParse(rawPart);
      if (part.success && part.data.text) texts.push(String(part.data.text));
    }
  }
  return texts.length > 0 ? texts.join("\n\n") : null;
}
