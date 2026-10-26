import type { Json } from "@/integrations/supabase/types";
import { isJsonObject, type JsonObject } from "@/lib/automationStepConfig";

export type UnsupportedRecipient = { type: "unsupported"; raw: Json };

export function idText(value: Json | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

export function isUnsupportedRecipient(
  entry: unknown,
): entry is UnsupportedRecipient {
  return isJsonObject(entry) && entry.type === "unsupported" && "raw" in entry;
}

export function parseStoredRecipients<T>(
  entries: Json[],
  parse: (entry: JsonObject) => T | undefined,
): Array<T | UnsupportedRecipient> {
  return entries.map((raw) => {
    const parsed = isJsonObject(raw) ? parse(raw) : undefined;
    return parsed ?? { type: "unsupported", raw };
  });
}

export function toStoredRecipients<T extends Json>(
  entries: Array<T | UnsupportedRecipient>,
): Json[] {
  return entries.map((entry) =>
    isUnsupportedRecipient(entry) ? entry.raw : entry,
  );
}
