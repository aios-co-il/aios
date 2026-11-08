import { z } from "npm:zod@3.25.76";

const errorLikeSchema = z.object({ message: z.unknown() });

/** The `message` of a thrown value, whether or not it is an Error instance. */
export function errorMessage(error: unknown): string {
  const parsed = errorLikeSchema.safeParse(error);
  if (!parsed.success) {
    return String(error);
  }
  const { message } = parsed.data;
  if (message === undefined || message === null) {
    return String(error);
  }
  return typeof message === "string" ? message : String(message);
}
