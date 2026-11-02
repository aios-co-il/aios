/**
 * One worker call of the nightly reconciliation (AIO-238): reconcile report
 * tables in id order after `cursor` until the table count, API-call budget or
 * wall-clock deadline is reached, then hand back the cursor for the next call.
 * Report-only: it stores runs and findings and never sends anything.
 */
import { MIN_CALLS } from "../_shared/reconcile/budget.ts";
import {
  platformFor,
  type ReconcilePlatform,
} from "../_shared/reconcile/run-status.ts";
import type { ChunkDeps, ChunkResult, ProcessedTable } from "./chunk-types.ts";
import { processTable } from "./process-table.ts";

/** Reconciles the tables after `cursor` and stores a run for each, until a limit stops the call. */
export async function runReconcileChunk(
  deps: ChunkDeps,
  opts: { cursor: string | null; maxTables: number },
): Promise<ChunkResult> {
  const log = deps.log || (() => {});
  const fetchLimit = Math.max(opts.maxTables * 4, 20);
  const tables = await deps.store.listTables({
    afterId: opts.cursor,
    limit: fetchLimit,
  });
  const processed: ProcessedTable[] = [];
  const rateLimited = new Set<ReconcilePlatform>();
  const rateLimitedTables: string[] = [];
  let cursor = opts.cursor;
  let stopped: ChunkResult["stopped"] = null;
  let considered = 0;

  for (const table of tables) {
    stopped = limitReached(processed.length, opts.maxTables, deps.deadline);
    if (stopped) {
      break;
    }
    if (table.client_status && table.client_status !== "active") {
      cursor = table.id;
      considered += 1;
      continue;
    }
    const platform = platformFor(table.integration_type);
    const passedOver = !!platform && rateLimited.has(platform);
    const minCalls = platform && !passedOver ? MIN_CALLS[platform] : 0;
    if (deps.budget.remaining < minCalls && processed.length > 0) {
      stopped = "budget";
      break;
    }

    const canStop = processed.length > 0;
    const outcome = await processTable(
      table,
      { platform, passedOver, canStop },
      deps,
      log,
    );
    if (outcome === "stop") {
      stopped = "budget";
      break;
    }
    if (passedOver) {
      rateLimitedTables.push(table.id);
    }
    // A per-ad-account throttle fails only this table.
    const { result } = outcome;
    if (
      result.error_kind === "rate_limit" &&
      result.rate_limit_scope !== "account" &&
      platform
    ) {
      rateLimited.add(platform);
    }
    processed.push(outcome.entry);
    cursor = table.id;
    considered += 1;
  }

  const exhausted = !stopped && tables.length < fetchLimit;
  if (!stopped && !exhausted && considered === tables.length) {
    stopped = "max_tables";
  }
  return {
    processed,
    next_cursor: exhausted ? null : cursor,
    done: exhausted,
    stopped,
    api_calls: deps.budget.used,
    rate_limited_tables: rateLimitedTables,
  };
}

/** Which limit stops the call before the next table, if any. */
function limitReached(
  processedCount: number,
  maxTables: number,
  deadline: number,
): ChunkResult["stopped"] {
  if (processedCount >= maxTables) {
    return "max_tables";
  }
  if (Date.now() >= deadline) {
    return "deadline";
  }
  return null;
}
