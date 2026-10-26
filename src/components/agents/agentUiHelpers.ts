import type { Json } from "@/integrations/supabase/types";

export type JsonObject = { [key: string]: Json | undefined };

export function asJsonObject(
  value: Json | undefined | null,
): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

export function asJsonArray(value: Json | undefined | null): Json[] {
  return Array.isArray(value) ? value : [];
}

/** The `message` of a thrown value as a string, or undefined when it has none. */
export function thrownMessage(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "message" in e) {
    return String(e.message);
  }
  return undefined;
}

export function jsonString(
  value: Json | undefined | null,
  key: string,
): string | undefined {
  const field = asJsonObject(value)?.[key];
  return typeof field === "string" ? field : undefined;
}

export function isOneOf<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return (values as readonly string[]).includes(value);
}

/** A JSON value React can render directly; nested objects/arrays become undefined. */
export function jsonPrimitive(
  value: Json | undefined,
): string | number | boolean | null | undefined {
  return typeof value === "object" && value !== null ? undefined : value;
}
