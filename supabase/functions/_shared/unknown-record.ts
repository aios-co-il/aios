// Zod readers for untrusted JSON (request bodies, provider responses, JSON
// columns): fields stay `unknown` until each caller checks them.
import { z } from "npm:zod@3.25.76";

export const unknownRecordSchema = z.record(z.string(), z.unknown());

export type UnknownRecord = z.infer<typeof unknownRecordSchema>;

/** The value when it is a plain object, else an empty record (reads yield undefined). */
export function asRecord(value: unknown): UnknownRecord {
  const parsed = unknownRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/** JSON.parse that yields an empty record for invalid JSON or non-objects. */
export function parseJsonRecord(raw: string): UnknownRecord {
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return {};
  }
}

const errorLikeSchema = z.object({ message: z.unknown() });

/** `e?.message ?? e` for a caught value of unknown shape. */
export function errorMessageOr(e: unknown): unknown {
  const parsed = errorLikeSchema.safeParse(e);
  return (parsed.success ? parsed.data.message : undefined) ?? e;
}
