import { z } from "npm:zod@3.25.76";

/** Read thrown database errors as well as ordinary JavaScript Errors. */
export function errorMessage(value: unknown): string {
  return readErrorMessage(value) ?? String(value);
}

/** Read a top-level error message without coercing malformed fields to strings. */
export function readErrorMessage(value: unknown): string | undefined {
  const parsed = errorMessageSchema.safeParse(value);
  return parsed.success ? parsed.data.message : undefined;
}

const errorMessageSchema = z.object({ message: z.string().optional() });
