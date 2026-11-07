// Narrow readers for untrusted JSON on the frontend: invoke responses, JSON
// columns and caught errors.

import type { Json } from "@/integrations/supabase/types";

export type JsonObject = { [key: string]: unknown };

/** The object member of the generated Json type (JSON columns). */
export type JsonColumnObject = { [key: string]: Json | undefined };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** The string at `key` of a JSON object, or undefined. */
export function jsonString(value: unknown, key: string): string | undefined {
  if (!isJsonObject(value)) return undefined;
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

/** The string entries of a JSON array, or [] when it is not an array. */
export function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/** String setting from an untrusted JSON object; numbers are stringified. */
export function readText(source: unknown, key: string): string | undefined {
  const value = asJsonObject(source)[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** String-valued entries of a JSON object column; null when the value is not an object. */
export function asStringMap(value: unknown): Record<string, string> | null {
  if (!isJsonObject(value)) return null;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** Reads `.message` from Error and error-like objects (e.g. PostgREST errors). */
export function errorMessageOf(error: unknown): string | undefined {
  if (!isJsonObject(error)) return undefined;
  const { message } = error;
  return message === undefined || message === null
    ? undefined
    : String(message);
}
