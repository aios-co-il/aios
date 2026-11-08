import type { Json } from "@/integrations/supabase/types";

export type JsonObject = { [key: string]: Json | undefined };

/** Narrow object-shaped JSON before dynamic field access. */
export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a dynamic field without trusting a non-object input. */
export function jsonField(value: unknown, key: string): unknown {
  return isJsonObject(value) ? value[key] : undefined;
}

/** Remove null and undefined entries while retaining the remaining value type. */
export function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/** Extract a readable message from a thrown value. */
export function errorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return undefined;
  }
  const { message } = error;
  return typeof message === "string" ? message : undefined;
}
