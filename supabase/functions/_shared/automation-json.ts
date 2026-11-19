import { z } from "npm:zod@3.25.76";
import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

/** Plain object decoded from JSON (request bodies, API responses, json columns). */
export const jsonObjectSchema: z.ZodType<JsonObject, z.ZodTypeDef, unknown> =
  z.record(z.custom<Json | undefined>());

const textSchema = z.union([
  z.string(),
  z.union([z.number(), z.nan()]).transform(String),
]);

const listSchema = z.array(z.unknown()).catch([]);

function parsedOr<T, F>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
  fallback: F,
): T | F {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

/** Plain-object check for values decoded from JSON (request bodies, API responses, json columns). */
export function isObject(value: unknown): value is JsonObject {
  return jsonObjectSchema.safeParse(value).success;
}

export function isJsonObject(value: Json | undefined): value is JsonObject {
  return isObject(value);
}

/** The value when it is a JSON object, otherwise an empty object. */
export function jsonObject(value: Json | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

export function asList(value: unknown): unknown[] {
  return listSchema.parse(value);
}

export function objectList(value: unknown): JsonObject[] {
  return asList(value).filter(isObject);
}

/** Strings pass through, numbers are stringified, anything else is "". */
export function asText(value: unknown): string {
  return parsedOr(textSchema, value, "");
}

export function optString(value: unknown): string | null {
  return parsedOr(z.string(), value, null);
}

/** Strings pass through, numbers are stringified, anything else is null. */
export function optText(value: unknown): string | null {
  return parsedOr(textSchema, value, null);
}

const errorLikeSchema = z.object({ message: z.unknown() });

/** `error.message` for Error and error-like objects (e.g. PostgREST errors). */
export function messageOf(error: unknown): string | undefined {
  const message = parsedOr(errorLikeSchema, error, undefined)?.message;
  return message ? String(message) : undefined;
}

/** The status fields read by `statusFiltersMatch`, as strings. */
export function statusFields(source: {
  status?: unknown;
  new_status?: unknown;
  status_kind?: unknown;
}) {
  return {
    status: optText(source.status),
    new_status: optText(source.new_status),
    status_kind: optString(source.status_kind),
  };
}

/** The fields read by `readStatusFilters`, as their expected types. */
export function statusFilterSource(source: {
  filter_statuses?: unknown;
  new_statuses?: unknown;
  filter_status?: unknown;
  filter_status_kind?: unknown;
  new_status?: unknown;
  status_kind?: unknown;
}) {
  return {
    filter_statuses: source.filter_statuses,
    new_statuses: source.new_statuses,
    filter_status: optText(source.filter_status),
    filter_status_kind: optString(source.filter_status_kind),
    new_status: optText(source.new_status),
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
