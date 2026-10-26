import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };
export type UnknownRecord = { [key: string]: unknown };

export function isObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonObject(value: Json | undefined): value is JsonObject {
  return isObject(value);
}

/** The value when it is a JSON object, otherwise an empty object. */
export function jsonObject(value: Json | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

export function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function objectList(value: unknown): UnknownRecord[] {
  return asList(value).filter(isObject);
}

/** Strings pass through, numbers are stringified, anything else is "". */
export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

export function optString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** `error.message` for Error and error-like objects (e.g. PostgREST errors). */
export function messageOf(error: unknown): string | undefined {
  if (!isObject(error)) return undefined;
  const message = error.message;
  return message ? String(message) : undefined;
}

/** The status fields read by `statusFiltersMatch`, as strings. */
export function statusFields(source: UnknownRecord) {
  return {
    status: optString(source.status),
    new_status: optString(source.new_status),
    status_kind: optString(source.status_kind),
  };
}

/** The fields read by `readStatusFilters`, as their expected types. */
export function statusFilterSource(source: UnknownRecord) {
  return {
    filter_statuses: source.filter_statuses,
    new_statuses: source.new_statuses,
    filter_status: optString(source.filter_status),
    filter_status_kind: optString(source.filter_status_kind),
    new_status: optString(source.new_status),
    status_kind: optString(source.status_kind),
  };
}

/** `value[key]` when value is a plain object (like `value?.[key]` on JSON data). */
export function prop(value: unknown, key: string): unknown {
  return isObject(value) ? value[key] : undefined;
}

/** The JSON that supabase-js sends for `value` (request bodies go through JSON.stringify). */
export function toJson(value: unknown): Json | undefined {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) return undefined;
  const decoded: Json = JSON.parse(encoded);
  return decoded;
}

/** null for null/undefined, otherwise the value as text. */
export function nullableText(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : String(value);
}
