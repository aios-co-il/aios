import { z } from "zod";

export interface SyncResult {
  leadId: string;
  leadName?: string;
  success: boolean;
  error?: string;
  subscriberId?: string;
  skipped?: boolean;
}

export interface SyncProgress {
  processed: number;
  failed: number;
  remaining: number;
  conflicts: number;
  total: number;
  results: SyncResult[];
}

export const SYNC_JOB_STATUSES = [
  "pending",
  "running",
  "completed",
  "stopped",
  "failed",
] as const;

export type SyncJobStatus = (typeof SYNC_JOB_STATUSES)[number];

const syncJobStatusSchema = z.enum(SYNC_JOB_STATUSES);

export function isSyncJobStatus(value: unknown): value is SyncJobStatus {
  return syncJobStatusSchema.safeParse(value).success;
}

const countOf = z.number().finite().catch(0);

const syncResultSchema = z.object({
  leadId: z.string(),
  success: z.boolean(),
  leadName: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
  subscriberId: z.string().optional().catch(undefined),
  skipped: z.boolean().optional().catch(undefined),
});

const syncResultList = z
  .array(z.unknown())
  .catch([])
  .transform((items) =>
    items.flatMap((item): SyncResult[] => {
      const parsed = syncResultSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  );

const syncProgressSchema = z
  .object({
    processed: countOf,
    failed: countOf,
    remaining: countOf,
    conflicts: countOf,
    total: countOf,
    results: syncResultList,
  })
  .catch({
    processed: 0,
    failed: 0,
    remaining: 0,
    conflicts: 0,
    total: 0,
    results: [],
  });

/** Normalizes `sync_jobs.progress` JSON; missing or malformed fields become 0 / []. */
export function parseSyncProgress(value: unknown): SyncProgress {
  return syncProgressSchema.parse(value);
}
