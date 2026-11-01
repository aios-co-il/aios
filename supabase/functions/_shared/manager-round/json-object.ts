/**
 * Reading stored JSON (finding evidence, integration settings, watermarks,
 * model answers, request fixtures) in the manager round, its collectors and
 * its card drafts.
 */
import type { Json } from "../database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

/** True for a JSON object (not an array, null or a scalar). */
export function isJsonObject(
  value: Json | null | undefined,
): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** The value when it is a JSON object (not null, not an array), else null. */
export function jsonObject(value: Json | null | undefined): JsonObject | null {
  return isJsonObject(value) ? value : null;
}
