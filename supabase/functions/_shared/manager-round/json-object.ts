/**
 * Reading stored JSON (finding evidence, integration settings, watermarks,
 * request fixtures) in the manager round and its card drafts.
 */
import type { Json } from "../database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

/** The value when it is a JSON object (not null, not an array), else null. */
export function jsonObject(value: Json | null | undefined): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}
