import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

/** Persisted/request JSON as an object for key reads; non-objects become `{}`. */
export function jsonObject(value: Json | undefined): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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
