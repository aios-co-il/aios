import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

export type JsonObject = { [key: string]: Json | undefined };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The object form of a JSON value; null, primitives and arrays read as `{}`. */
export function asJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** Any JSON object (not null or an array), kept as-is. */
export const jsonObjectSchema = z.custom<JsonObject>(isJsonObject);

/** A JSON value passed through untouched. */
export const jsonValueSchema = z.custom<Json>(() => true);

const rowList = z.array(z.unknown()).catch([]);

/** Parses each row of a list on its own; malformed rows and non-list input drop out. */
export function parseEach<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
): z.output<S>[] {
  return rowList.parse(value).flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** `parseEach` as a schema, for list fields of a larger body. */
export const listOf = <S extends z.ZodTypeAny>(schema: S) =>
  z.unknown().transform((value) => parseEach(schema, value));

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asJsonArray(value: Json | null | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

export function jsonObjects(value: unknown): JsonObject[] {
  return asArray(value).filter(isJsonObject);
}

export function readField(obj: unknown, key: string): Json | undefined {
  return isJsonObject(obj) ? obj[key] : undefined;
}

export function readString(obj: unknown, key: string): string | undefined {
  const value = readField(obj, key);
  return typeof value === "string" ? value : undefined;
}

export function readNumber(obj: unknown, key: string): number | undefined {
  const value = readField(obj, key);
  return typeof value === "number" ? value : undefined;
}

/** Strings as-is and numbers stringified; anything else is undefined. */
export function readText(obj: unknown, key: string): string | undefined {
  const value = readField(obj, key);
  if (typeof value === "string") return value;
  return typeof value === "number" ? String(value) : undefined;
}

export function readDateInput(
  obj: unknown,
  key: string,
): string | number | undefined {
  const value = readField(obj, key);
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}

/** `parseFloat` on a JSON value, with the same implicit string coercion. */
export const parseJsonFloat = (value: Json | undefined): number =>
  parseFloat(String(value));

export function readFloat(obj: unknown, key: string): number {
  return parseJsonFloat(readField(obj, key));
}

export function errorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return undefined;
  }
  const { message } = error;
  return typeof message === "string" ? message : undefined;
}

/** `err?.message` for any thrown value (Error, PostgrestError, plain objects). */
export function thrownMessage(err: unknown): unknown {
  return typeof err === "object" && err !== null && "message" in err
    ? err.message
    : undefined;
}

/** `err?.code` for any thrown value (PostgrestError / FunctionsError). */
export function thrownCode(err: unknown): unknown {
  return typeof err === "object" && err !== null && "code" in err
    ? err.code
    : undefined;
}
