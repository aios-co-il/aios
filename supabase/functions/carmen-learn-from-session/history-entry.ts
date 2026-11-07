import { z } from "npm:zod@3.25.76";

const historyEntrySchema = z
  .object({
    role: z.unknown(),
    direction: z.unknown(),
    content: z.unknown(),
    message: z.unknown(),
    text: z.unknown(),
  })
  .catch({});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export function readHistoryEntry(raw: unknown): HistoryEntry {
  return historyEntrySchema.parse(raw);
}
