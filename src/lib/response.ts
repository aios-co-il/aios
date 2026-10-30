import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

export type JsonObject = { [key: string]: Json | undefined };

const jsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.custom<Json | undefined>(),
);

const errorWithMessageSchema = z.object({ message: z.unknown() });

/** A jsonb value as a key/value object, or null for arrays and primitives. */
export function asJsonObject(value: Json | undefined): JsonObject | null {
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Reads a thrown value's `message` without assuming an Error instance. */
export function readErrorMessage(error: unknown): string | undefined {
  const parsed = errorWithMessageSchema.safeParse(error);
  if (!parsed.success) return undefined;
  const { message } = parsed.data;
  if (message === undefined || message === null) return undefined;
  return typeof message === "string" ? message : String(message);
}
