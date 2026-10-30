import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

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

export function asJsonObject(
  value: Json | undefined | null,
): JsonObject | null {
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const jsonArraySchema = z.array(jsonValueSchema);

export function asJsonArray(value: Json | undefined | null): Json[] {
  return parseJsonArray(value) ?? [];
}

/** The value as a JSON array, or null when it is not one. */
export function parseJsonArray(value: unknown): Json[] | null {
  const parsed = jsonArraySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const thrownSchema = z.object({ message: z.unknown() });

/** The `message` of a thrown value as a string, or undefined when it has none. */
export function thrownMessage(e: unknown): string | undefined {
  const parsed = thrownSchema.safeParse(e);
  if (!parsed.success || parsed.data.message == null) return undefined;
  return String(parsed.data.message);
}

const stringSchema = z.string().optional().catch(undefined);

export function jsonString(
  value: Json | undefined | null,
  key: string,
): string | undefined {
  return stringSchema.parse(asJsonObject(value)?.[key]);
}

export function isOneOf<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return (values as readonly string[]).includes(value);
}

const primitiveSchema = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .optional()
  .catch(undefined);

/** A JSON value React can render directly; nested objects/arrays become undefined. */
export function jsonPrimitive(
  value: Json | undefined,
): string | number | boolean | null | undefined {
  return primitiveSchema.parse(value);
}
