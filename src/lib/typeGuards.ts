import type { Json } from "@/integrations/supabase/types";

export type JsonObject = { [key: string]: Json | undefined };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function jsonField(value: unknown, key: string): unknown {
  return isJsonObject(value) ? value[key] : undefined;
}

export function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function errorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return undefined;
  }
  const { message } = error;
  return typeof message === "string" ? message : undefined;
}
