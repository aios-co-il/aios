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

type UnknownRecord = { [key: string]: unknown };

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalOf = <T>(
  value: unknown,
  check: (v: unknown) => v is T,
): T | undefined => (check(value) ? value : undefined);

const isString = (v: unknown): v is string => typeof v === "string";
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
const countOf = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

export function isSyncJobStatus(value: unknown): value is SyncJobStatus {
  return SYNC_JOB_STATUSES.some((status) => status === value);
}

function parseSyncResult(value: unknown): SyncResult[] {
  if (!isRecord(value)) return [];
  if (typeof value.leadId !== "string" || typeof value.success !== "boolean") {
    return [];
  }
  return [
    {
      leadId: value.leadId,
      success: value.success,
      leadName: optionalOf(value.leadName, isString),
      error: optionalOf(value.error, isString),
      subscriberId: optionalOf(value.subscriberId, isString),
      skipped: optionalOf(value.skipped, isBoolean),
    },
  ];
}

/** Normalizes `sync_jobs.progress` JSON; missing or malformed fields become 0 / []. */
export function parseSyncProgress(value: unknown): SyncProgress {
  const progress = isRecord(value) ? value : {};
  return {
    processed: countOf(progress.processed),
    failed: countOf(progress.failed),
    remaining: countOf(progress.remaining),
    conflicts: countOf(progress.conflicts),
    total: countOf(progress.total),
    results: Array.isArray(progress.results)
      ? progress.results.flatMap(parseSyncResult)
      : [],
  };
}
