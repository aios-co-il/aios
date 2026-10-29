import { z } from "zod";

const errorWithMessageSchema = z.object({ message: z.string() });

/** The string `message` of a thrown value (Error, PostgREST error, ...), if it has one. */
export function errorMessageOf(error: unknown): string | undefined {
  return errorWithMessageSchema.safeParse(error).data?.message;
}
