import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

/** The value as a JSON object (not an array), or undefined. */
export function asJsonObject(value: Json | undefined): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

/** `value?.[key]` for parsed JSON: undefined unless `value` is a JSON object. */
export function jsonField(
  value: Json | undefined,
  key: string,
): Json | undefined {
  return asJsonObject(value)?.[key];
}

/** The value when it is an array, otherwise []. */
export function jsonArray(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

/** A property of a thrown/unknown value, like `(value as any)?.[key]`. */
export function unknownField(value: unknown, key: string): unknown {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return undefined;
  }
  return key in value ? Reflect.get(value, key) : undefined;
}

/** `e?.message ?? e` for a caught value. */
export function thrownMessage(e: unknown): unknown {
  return unknownField(e, "message") ?? e;
}

/**
 * The JSON a write would send for `value` (JSON.stringify semantics), as a typed Json value.
 * Undefined stays undefined, so the field is omitted from the write as before.
 */
export function toJson(value: object): Json;
export function toJson(value: object | undefined): Json | undefined;
export function toJson(value: object | undefined): Json | undefined {
  const text = JSON.stringify(value);
  return text === undefined ? undefined : JSON.parse(text);
}
