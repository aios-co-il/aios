import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

const optionalString = z.string().optional().catch(undefined);

const manusWaSettingsSchema = z
  .object({
    api_key: optionalString,
    webhook_id: optionalString,
    webhook_url: optionalString,
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

/** Preserve opaque storage fields only while writing validated Manus settings. */
export function mergeManusSettings(
  settings: Json | null | undefined,
  patch: ManusWaSettings,
): Json {
  const stored =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? settings
      : {};
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, field]) => field !== undefined),
  );
  return { ...stored, ...definedPatch };
}

const manusOutputSchema = z.array(z.unknown());
const manusOutputItemSchema = z.object({ content: z.array(z.unknown()) });
const manusOutputTextPartSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
});

/** Concatenated `output_text` parts of a Manus task output, or null when there are none. */
export function manusOutputText(
  output: Json | null | undefined,
): string | null {
  const items = manusOutputSchema.safeParse(output);
  if (!items.success) {
    return null;
  }
  const texts: string[] = [];
  for (const rawItem of items.data) {
    const item = manusOutputItemSchema.safeParse(rawItem);
    if (!item.success) {
      continue;
    }
    for (const rawPart of item.data.content) {
      const part = manusOutputTextPartSchema.safeParse(rawPart);
      if (part.success && part.data.text) {
        texts.push(part.data.text);
      }
    }
  }
  return texts.length > 0 ? texts.join("\n\n") : null;
}
