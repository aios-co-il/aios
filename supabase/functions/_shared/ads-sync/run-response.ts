import type { SyncOutcome } from "./outcome.ts";

/**
 * Response body and HTTP status of a report sync run. A failed run answers 502
 * with `success: false` and the (redacted) error, so a caller never reads it as
 * fresh data.
 */
export function syncRunBody(
  outcome: SyncOutcome,
  lastSyncAt: string | null,
  extra: Record<string, unknown> = {},
): { body: Record<string, unknown>; status: number } {
  const failed = outcome.status === "failed";
  return {
    status: failed ? 502 : 200,
    body: {
      success: !failed,
      ...(failed ? { error: outcome.error } : {}),
      records_synced: outcome.rows,
      ...extra,
      outcome,
      last_sync_at: lastSyncAt,
    },
  };
}
