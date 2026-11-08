import { z } from "npm:zod@3.25.76";

const errorLikeSchema = z.object({ message: z.unknown() });

/** Reads a thrown value's `message` as `(e as any).message` did, without assuming an Error instance. */
export function errorMessage(error: unknown): string | undefined {
  const parsed = errorLikeSchema.safeParse(error);
  if (!parsed.success) return undefined;
  const { message } = parsed.data;
  if (message === undefined || message === null) return undefined;
  return typeof message === "string" ? message : String(message);
}
