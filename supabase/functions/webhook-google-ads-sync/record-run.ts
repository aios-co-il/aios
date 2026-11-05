import {
  buildSyncOutcome,
  type SyncOutcomeStatus,
} from "../_shared/ads-sync/outcome.ts";
import { saveSyncRun } from "../_shared/ads-sync/save-run.ts";
import type { SyncClient } from "../_shared/ads-sync/write-window.ts";

const SOURCE = "webhook-google-ads-sync";

/**
 * Record a webhook run on its table: last_sync_at moves only when everything
 * received was written; the attempt and its outcome are always recorded.
 */
export async function recordWebhookRun(
  client: SyncClient,
  table: {
    id: string;
    tenant_id: string;
    integration_settings?: Record<string, unknown> | null;
  },
  writes: { written: number; writeErrors: number },
): Promise<void> {
  await saveSyncRun(
    client,
    { tableId: table.id, tenantId: table.tenant_id },
    {
      outcome: buildSyncOutcome({
        status: webhookOutcomeStatus(writes.writeErrors, writes.written),
        rows: writes.written,
        error:
          writes.writeErrors > 0 ? `${writes.writeErrors} writes failed` : null,
        source: SOURCE,
      }),
      fallbackSettings: table.integration_settings || {},
    },
  );
}

/** failed when any write failed; otherwise ok when rows were written, empty when none were. */
function webhookOutcomeStatus(
  writeErrors: number,
  written: number,
): SyncOutcomeStatus {
  if (writeErrors > 0) {
    return "failed";
  }
  return written > 0 ? "ok" : "empty";
}
