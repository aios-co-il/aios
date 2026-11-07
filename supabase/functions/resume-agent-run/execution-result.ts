import { z } from "npm:zod@3.25.76";

const failedResultSchema = z.object({ ok: z.literal(false) });

/** Handlers report a failed execution as `{ ok: false, ... }`. */
export function reportsFailure(result: unknown): boolean {
  return failedResultSchema.safeParse(result).success;
}
