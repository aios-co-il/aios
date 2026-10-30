// Zod readers for persisted JSON columns and untrusted request/response payloads.
import { z } from "npm:zod@3.25.76";
import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

export const jsonValueSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const jsonObjectSchema = z.record(z.string(), jsonValueSchema).catch({});

/** Persisted/request JSON as an object for key reads; non-objects become `{}`. */
export function jsonObject(value: Json | undefined): JsonObject {
  return jsonObjectSchema.parse(value);
}

const recordSchema = z.record(z.string(), z.unknown()).catch({});

/** An untrusted payload as a plain object for key reads; non-objects become `{}`. */
export function asRecord(value: unknown): Record<string, unknown> {
  return recordSchema.parse(value);
}

const jsonTextSchema = z
  .union([
    z.string(),
    z.number().transform(String),
    z.boolean().transform(String),
    z
      .union([z.array(z.unknown()), z.record(z.string(), z.unknown())])
      .transform((value) => JSON.stringify(value)),
  ])
  .optional()
  .catch(undefined);

/** JSON value as the text Postgres stores for it in a text column; null/undefined stay undefined. */
export function jsonText(value: Json | undefined): string | undefined {
  return jsonTextSchema.parse(value);
}

/** `value || fallback` for JSON input, keeping the value as its stored text. */
export function textOr<T>(value: Json | undefined, fallback: T): string | T {
  return (value && jsonText(value)) || fallback;
}

const stringSchema = z.string().optional().catch(undefined);

/** The value when it is a string, else undefined. */
export function jsonString(value: Json | undefined): string | undefined {
  return stringSchema.parse(value);
}

const thrownSchema = z.object({ message: z.unknown() });

/** Reads `e?.message` from any thrown value without assuming an Error instance. */
export function thrownMessage(e: unknown): unknown {
  const parsed = thrownSchema.safeParse(e);
  return parsed.success ? parsed.data.message : undefined;
}
