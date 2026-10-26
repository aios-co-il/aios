import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

export function isJsonObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Object view of a JSON column/body; anything that is not a plain object reads as `{}`. */
export function asJsonObject(value: Json | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** `value?.[key]` for JSON values: only plain objects have fields. */
export function jsonField(
  value: Json | undefined,
  key: string,
): Json | undefined {
  return isJsonObject(value) ? value[key] : undefined;
}

/** A non-empty string field, otherwise `undefined`. */
export function jsonText(
  value: Json | undefined,
  key: string,
): string | undefined {
  const field = jsonField(value, key);
  return typeof field === "string" && field ? field : undefined;
}

/** Reads `.message` the way `err.message` did for thrown values (Error or PostgREST error objects). */
export function thrownMessage(error: unknown): unknown {
  if (typeof error === "object" && error !== null && "message" in error) {
    return error.message;
  }
  return undefined;
}

/** `a || b || null` over JSON values, stringified the way a PostgREST filter or URL would render it. */
export function firstTruthyText(
  ...values: (Json | undefined)[]
): string | null {
  for (const value of values) {
    if (value) return String(value);
  }
  return null;
}

/** `new Date(value)` for a JSON value: null, numbers and booleans as epoch ms, everything else parsed as text. */
export function jsonToDate(value: Json): Date {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return new Date(Number(value));
  }
  return new Date(String(value));
}
