import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

/** Object view of a JSON value; null/undefined throw like the former direct property access. */
export function jsonObject(value: Json | undefined): JsonObject {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value}`);
  }
  return typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** Text form PostgREST stores when a JSON value is written to a text column; null/undefined stay null. */
export function jsonText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
