import { z } from "npm:zod@3.25.76";
import type { Json } from "../_shared/database.types.ts";

export interface SyncResult {
  leadId: string;
  leadName: string;
  success: boolean;
  subscriberId?: string;
  error?: string;
  skipped?: boolean;
}

export interface SyncProgress {
  processed: number;
  failed: number;
  conflicts: number;
  total: number;
  results: SyncResult[];
}

/** A stored result is kept as written once its id, name and outcome are there. */
const syncResultSchema = z
  .object({ leadId: z.string(), leadName: z.string(), success: z.boolean() })
  .passthrough();

const counter = z.unknown().transform((value) => Number(value) || 0);

const syncProgressSchema = z
  .object({
    processed: counter,
    failed: counter,
    conflicts: counter,
    total: counter,
    results: z.array(z.unknown()).catch([]),
  })
  .catch({ processed: 0, failed: 0, conflicts: 0, total: 0, results: [] });

/** Reads sync_jobs.progress so a resumed run continues the stored counters. */
export function readSyncProgress(progress: Json | undefined): SyncProgress {
  const { results, ...counters } = syncProgressSchema.parse(progress);
  return {
    ...counters,
    results: results.flatMap((item): SyncResult[] => {
      const parsed = syncResultSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  };
}
