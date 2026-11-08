import { z } from "npm:zod@3.25.76";

const historyEntrySchema = z
  .object({
    role: z.string().optional().catch(undefined),
    direction: z.string().optional().catch(undefined),
    content: z.string().optional().catch(undefined),
    message: z.string().optional().catch(undefined),
    text: z.string().optional().catch(undefined),
  })
  .catch({});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

/** Validate the history text used to learn from a completed session. */
export function readHistoryEntry(raw: unknown): HistoryEntry {
  return historyEntrySchema.parse(raw);
}
