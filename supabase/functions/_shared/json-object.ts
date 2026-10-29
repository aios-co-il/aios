import { z } from "npm:zod@3.25.76";
import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

const jsonValueSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

/** Object view of a JSON value; null/undefined throw like the former direct property access. */
export function jsonObject(value: unknown): JsonObject {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value}`);
  }
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/** Text form PostgREST stores when a JSON value is written to a text column; null/undefined stay null. */
export function jsonText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
