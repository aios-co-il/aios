import { jsonArray, jsonField, unknownField } from "../_shared/json-fields.ts";
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

function isSyncResult(value: unknown): value is SyncResult {
  return (
    typeof unknownField(value, "leadId") === "string" &&
    typeof unknownField(value, "leadName") === "string" &&
    typeof unknownField(value, "success") === "boolean"
  );
}

function counter(progress: Json | undefined, key: string): number {
  return Number(jsonField(progress, key)) || 0;
}

/** Reads sync_jobs.progress so a resumed run continues the stored counters. */
export function readSyncProgress(progress: Json | undefined): SyncProgress {
  const results: SyncResult[] = [];
  for (const item of jsonArray(jsonField(progress, "results"))) {
    if (isSyncResult(item)) results.push(item);
  }
  return {
    processed: counter(progress, "processed"),
    failed: counter(progress, "failed"),
    conflicts: counter(progress, "conflicts"),
    total: counter(progress, "total"),
    results,
  };
}
