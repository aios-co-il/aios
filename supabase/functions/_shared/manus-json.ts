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

/** The value as a JSON object, or null for scalars, arrays, null and undefined. */
export function asJsonObject(value: Json | undefined): JsonObject | null {
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** `JSON.parse(text)`, or `{ raw: text }` when the text is not valid JSON. */
export function parseJsonOrRaw(text: string): Json {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const thrownSchema = z.object({ message: z.unknown(), name: z.unknown() });

/** `e.message` when the thrown value carries one, otherwise undefined. */
export function thrownMessage(e: unknown): unknown {
  const parsed = thrownSchema.safeParse(e);
  return parsed.success ? parsed.data.message : undefined;
}

/** `e.name` when the thrown value carries one, otherwise undefined. */
export function thrownName(e: unknown): unknown {
  const parsed = thrownSchema.safeParse(e);
  return parsed.success ? parsed.data.name : undefined;
}
