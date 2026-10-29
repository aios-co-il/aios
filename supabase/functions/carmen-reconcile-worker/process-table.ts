/**
 * One table of a chunk (AIO-238): reconcile it (or pass it over while its
 * platform is rate limited), follow up a mismatch, and store the run.
 */
import { isBudgetError, redactedMessage } from "../_shared/reconcile/errors.ts";
import { RECONCILE_TOLERANCE } from "../_shared/reconcile/metrics.ts";
import {
  MAX_FINDINGS_PER_TABLE,
  reconcileTable,
} from "../_shared/reconcile/reconcile-table.ts";
import {
  PLATFORM_RATE_LIMITED,
  type ReconcilePlatform,
} from "../_shared/reconcile/run-status.ts";
import type { TableReconcileResult } from "../_shared/reconcile/run-summary.ts";
import { skippedResult } from "../_shared/reconcile/skipped-or-failed.ts";
import type { ReconcileTable } from "../_shared/reconcile/types.ts";
import type { ChunkDeps, ProcessedTable } from "./chunk-types.ts";
import { followUpMismatch } from "./resync.ts";
import { runRecord } from "./run-record.ts";

/**
 * The table's stored result and its entry in the chunk's answer, or "stop"
 * when the budget ran out after other tables (the next call retries this one
 * with a fresh budget).
 */
export async function processTable(
  table: ReconcileTable,
  state: {
    platform: ReconcilePlatform | null;
    /** The platform already refused a call in this chunk. */
    passedOver: boolean;
    canStop: boolean;
  },
  deps: ChunkDeps,
  log: (message: string) => void,
): Promise<{ result: TableReconcileResult; entry: ProcessedTable } | "stop"> {
  const startedAt = deps.now();
  // A platform that already refused a call is not asked again: that only burns
  // quota. The skipped run lets get_reconciliation_status list the table as not
  // checked, while the trust line and the persisting check look past it to the
  // previous result. The worker tries these tables once more after the walk.
  const result =
    state.passedOver && state.platform
      ? skippedResult(
          state.platform,
          { platform: state.platform },
          PLATFORM_RATE_LIMITED,
        )
      : await reconcileOrFail(table, state, deps, startedAt);
  if (result === "stop") {
    return "stop";
  }
  const entry: ProcessedTable = {
    table_id: table.id,
    status: result.status,
    findings: result.findings.length,
    error_kind: result.error_kind,
    ...(state.passedOver ? { skipped_reason: PLATFORM_RATE_LIMITED } : {}),
  };
  if (result.status === "mismatch") {
    const resync = await followUpMismatch(
      table,
      result,
      {
        latestRun: (id) => deps.store.latestRun(id),
        triggerResync: deps.triggerResync,
        now: deps.now,
        log,
      },
      startedAt,
    );
    if (resync) {
      entry.resync = resync;
    }
  }
  Object.assign(entry, await saveResult(deps, table, result, startedAt, log));
  return { result, entry };
}

/** The table's result, a failed result for an unexpected error, or "stop" (see processTable). */
async function reconcileOrFail(
  table: ReconcileTable,
  state: { platform: ReconcilePlatform | null; canStop: boolean },
  deps: ChunkDeps,
  startedAt: Date,
): Promise<TableReconcileResult | "stop"> {
  try {
    return await reconcileTable({
      table,
      source: deps.sourceFor(table),
      readAios: deps.store.readAios,
      now: startedAt,
      tolerance: RECONCILE_TOLERANCE,
      maxFindings: MAX_FINDINGS_PER_TABLE,
    });
  } catch (err) {
    const isBudget = isBudgetError(err);
    if (isBudget && state.canStop) {
      return "stop";
    }
    const { platform } = state;
    return {
      status: "failed",
      platform,
      window_start: null,
      window_end: null,
      findings: [],
      error_kind: isBudget ? "budget" : "platform",
      summary: {
        platform,
        error_kind: isBudget ? "budget" : "internal",
        error: redactedMessage(err),
      },
    };
  }
}

/** Stores the run; the new run id, or the redacted save error (logged). */
async function saveResult(
  deps: ChunkDeps,
  table: ReconcileTable,
  result: TableReconcileResult,
  startedAt: Date,
  log: (message: string) => void,
): Promise<Pick<ProcessedTable, "run_id" | "save_error">> {
  try {
    const run = runRecord(table, result, startedAt, deps.now());
    return { run_id: await deps.store.saveRun(run, result.findings) };
  } catch (err) {
    const saveError = redactedMessage(err);
    log(`[reconcile] save failed for ${table.id}: ${saveError}`);
    return { save_error: saveError };
  }
}
