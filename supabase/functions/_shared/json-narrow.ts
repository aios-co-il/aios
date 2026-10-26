import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

export function isJsonObject(value: Json | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Persisted/request JSON as an object for key reads; non-objects become `{}`. */
export function jsonObject(value: Json | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** JSON scalar as the text Postgres would store for it; objects/arrays/null become undefined. */
export function jsonText(value: Json | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return undefined;
}

/** `value || fallback` for JSON input, keeping scalars as their stored text. */
export function textOr<T>(value: Json | undefined, fallback: T): string | T {
  return (value && jsonText(value)) || fallback;
}

/** Reads `e?.message` from any thrown value without assuming an Error instance. */
export function thrownMessage(e: unknown): unknown {
  if (e === null || (typeof e !== "object" && typeof e !== "function")) {
    return undefined;
  }
  return "message" in e ? e.message : undefined;
}

/** Plain (non-array) object guard for untrusted request/response payloads. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
