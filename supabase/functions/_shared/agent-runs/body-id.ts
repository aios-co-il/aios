/**
 * Reads an id from a request body the way the database will (AIO-659).
 * supabase-js sends an array as its joined items, and PostgreSQL also takes a
 * uuid without hyphens or in braces, so any of those could name a row to a
 * query while a guard that compares text reads it as another id, or as none.
 */
import { asUuidOrNull } from "../uuid.ts";

/** The id when the value is exactly a hyphenated uuid string, else null. */
export function bodyUuid(value: unknown): string | null {
  return typeof value === "string" && asUuidOrNull(value) === value
    ? value
    : null;
}
