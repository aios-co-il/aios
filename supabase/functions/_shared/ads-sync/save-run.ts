/**
 * Store a finished ads sync run on its crm_tables row (see outcome.ts for what
 * each field means).
 */
import { isRecord } from "./is-record.ts";
import {
  buildSyncOutcome,
  isWriteSuccess,
  settingsMirrorOutcome,
  type SyncOutcome,
} from "./outcome.ts";
import { redactSyncError } from "./redact.ts";
import {
  asSyncDbClient,
  type SyncClient,
  type SyncDbClient,
} from "./write-window.ts";

/** The crm_tables row a run belongs to; every read and write is scoped to its tenant. */
export type SyncRunTable = { tableId: string; tenantId: string };

type SaveOptions = {
  outcome: SyncOutcome;
  catchup?: boolean;
  settingsPatch?: Record<string, unknown>;
  fallbackSettings?: Record<string, unknown> | null;
  log?: (message: string) => void;
};

/**
 * Store a finished run on crm_tables.
 *
 * - `last_sync_at` (column + settings) moves only after a successful write.
 * - `last_sync_attempt_at` / `last_sync_outcome` are recorded on every run (column
 *   + settings mirror). A catch-up chunk records only a failure: the refresh run
 *   that follows owns the outcome.
 * - The error text goes to the column only, redacted: the settings mirror has no
 *   `error`, because the public share-link endpoints return the settings verbatim.
 * - `settingsPatch` is merged into the latest settings, not the copy the run
 *   started with. That narrows the window for lost concurrent edits (currency
 *   etc.); the read-modify-write is not atomic.
 */
export async function saveSyncRun(
  syncClient: SyncClient,
  table: SyncRunTable,
  opts: SaveOptions,
): Promise<{ lastSyncAt: string | null; recorded: boolean }> {
  const client = asSyncDbClient(syncClient);
  const outcome: SyncOutcome = opts.outcome.error
    ? { ...opts.outcome, error: redactSyncError(opts.outcome.error) }
    : opts.outcome;
  const log = opts.log || ((message: string) => console.error(message));
  const stamp = isWriteSuccess(outcome.status) && !opts.catchup;
  const record = !opts.catchup || outcome.status === "failed";
  const patch: Record<string, unknown> = { ...(opts.settingsPatch || {}) };
  if (stamp) {
    patch.last_sync_at = outcome.at;
  }
  if (record) {
    patch.last_sync_attempt_at = outcome.at;
    patch.last_sync_outcome = settingsMirrorOutcome(outcome);
  }

  if (Object.keys(patch).length > 0) {
    await mergeSettings(client, table, {
      patch,
      stampAt: stamp ? outcome.at : null,
      fallbackSettings: opts.fallbackSettings,
      log,
    });
  }

  if (record) {
    // Separate write: until the columns exist this fails alone, never the stamp above.
    const { error } = await client
      .from("crm_tables")
      .update({
        last_sync_attempt_at: outcome.at,
        last_sync_outcome: outcome,
      })
      .eq("id", table.tableId)
      .eq("tenant_id", table.tenantId);
    if (error) {
      log(`[sync-outcome] outcome columns update failed: ${error.message}`);
    }
  }
  return { lastSyncAt: stamp ? outcome.at : null, recorded: record };
}

/**
 * Records an unexpected failure as a `failed` run. Never throws: a failure to
 * record is logged, so the caller's error response still goes out.
 */
export function failedRunRecorder(
  client: SyncClient,
  run: SyncRunTable & {
    source: string;
    catchup?: boolean;
    fallbackSettings?: Record<string, unknown> | null;
  },
): (message: string) => Promise<void> {
  return async (message) => {
    try {
      await saveSyncRun(client, run, {
        outcome: buildSyncOutcome({
          status: "failed",
          error: message,
          source: run.source,
        }),
        catchup: run.catchup,
        fallbackSettings: run.fallbackSettings,
      });
    } catch (error) {
      console.error(
        `[${run.source}] recording failed run failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  };
}

/**
 * Merge `patch` into the row's latest settings (and stamp the last_sync_at column).
 * A failed read falls back to the settings the run started with, as before.
 */
async function mergeSettings(
  client: SyncDbClient,
  table: SyncRunTable,
  input: {
    patch: Record<string, unknown>;
    stampAt: string | null;
    fallbackSettings?: Record<string, unknown> | null;
    log: (message: string) => void;
  },
): Promise<void> {
  const { data: fresh, error: readError } = await client
    .from("crm_tables")
    .select("integration_settings")
    .eq("id", table.tableId)
    .eq("tenant_id", table.tenantId)
    .maybeSingle();
  if (readError) {
    input.log(
      `[sync-outcome] settings read failed, merging into the run-start copy: ${readError.message}`,
    );
  }
  const stored = isRecord(fresh) ? fresh.integration_settings : null;
  const current = isRecord(stored) ? stored : input.fallbackSettings || {};
  const { error } = await client
    .from("crm_tables")
    .update({
      integration_settings: { ...current, ...input.patch },
      ...(input.stampAt ? { last_sync_at: input.stampAt } : {}),
    })
    .eq("id", table.tableId)
    .eq("tenant_id", table.tenantId);
  if (error) {
    input.log(`[sync-outcome] settings update failed: ${error.message}`);
  }
}
