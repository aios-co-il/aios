import type { Json } from "./database.types.ts";

export type UnknownObject = { readonly [key: string]: unknown };
export type JsonObject = { [key: string]: Json | undefined };

/** The value as a plain object, or null for scalars, arrays, null and undefined. */
export function asObject(value: unknown): UnknownObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownObject)
    : null;
}

/** A JSON column value as an object, or null for scalars, arrays and null. */
export function asJsonObject(value: Json | undefined): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

/** `e.message` when the thrown value carries one, otherwise undefined. */
export function thrownMessage(e: unknown): unknown {
  return typeof e === "object" && e !== null && "message" in e
    ? e.message
    : undefined;
}
