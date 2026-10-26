import type { Json } from "@/integrations/supabase/types";

export type JsonObject = { [key: string]: Json | undefined };

export function isJsonObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The settings object stored on a tenant_integrations row, or `{}` when it is not an object. */
export function integrationSettingsObject(
  settings: Json | null | undefined,
): JsonObject {
  return isJsonObject(settings) ? settings : {};
}

export type ManusWaSettings = {
  instance_id?: string;
  webhook_secret?: string;
  country_code?: string;
  status?: string;
  phone_number?: string;
};

function stringField(obj: JsonObject, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

/** String fields the Manus WhatsApp settings UI reads; non-string values are treated as missing. */
export function readManusWaSettings(
  settings: Json | null | undefined,
): ManusWaSettings {
  const obj = integrationSettingsObject(settings);
  return {
    instance_id: stringField(obj, "instance_id"),
    webhook_secret: stringField(obj, "webhook_secret"),
    country_code: stringField(obj, "country_code"),
    status: stringField(obj, "status"),
    phone_number: stringField(obj, "phone_number"),
  };
}

/** Concatenated `output_text` parts of a Manus task output, or null when there are none. */
export function manusOutputText(
  output: Json | null | undefined,
): string | null {
  if (!output || !Array.isArray(output)) return null;
  const texts: string[] = [];
  for (const item of output) {
    if (!isJsonObject(item) || !Array.isArray(item.content)) continue;
    for (const c of item.content) {
      if (
        isJsonObject(c) &&
        c.type === "output_text" &&
        typeof c.text === "string" &&
        c.text
      ) {
        texts.push(c.text);
      }
    }
  }
  return texts.length > 0 ? texts.join("\n\n") : null;
}
