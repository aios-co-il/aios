/**
 * The three phases of a worker call (AIO-238): a chunk of report tables, the
 * retry pass over tables a rate limit passed over, and the unmapped-accounts
 * check.
 */
import { type ChainStep, nextAfterChunk } from "./chain.ts";
import { runReconcileChunk } from "./chunk.ts";
import { listMetaAccountsWithSpend } from "./meta-accounts.ts";
import type { WorkerRequest } from "./request.ts";
import { chunkDeps, type WorkerContext } from "./sources.ts";
import { saveReconcileRun } from "./store.ts";
import { runUnmappedAccountsCheck } from "./unmapped-accounts.ts";
import {
  listMappedMetaAccounts,
  nextMetaConnectionTenant,
} from "./unmapped-accounts-db.ts";

/** Runs the request's phase: the call's answer, and the chain step after it (null to stop). */
export async function runPhase(
  request: WorkerRequest,
  ctx: WorkerContext,
): Promise<{ result: Record<string, unknown>; next: ChainStep | null }> {
  // Only the unscoped nightly chain goes on to the retry and accounts phases.
  const nightly = !request.scoped && !request.useFixture;
  if (request.phase === "retry" && !request.deferred.length) {
    // Nothing to retry (an empty id list would select every table).
    return {
      result: { phase: request.phase, done: true },
      next: nightly ? { phase: "accounts", cursor: null } : null,
    };
  }
  if (request.phase !== "accounts") {
    const chunk = await runReconcileChunk(chunkDeps(ctx, request), {
      cursor: request.cursor,
      maxTables: request.maxTables,
    });
    return {
      result: { phase: request.phase, ...chunk },
      next:
        !chunk.done || nightly
          ? nextAfterChunk(request.phase, request.deferred, chunk)
          : null,
    };
  }
  const check = await runUnmappedAccountsCheck({
    cursor: request.cursor,
    nextTenant: (after) => nextMetaConnectionTenant(ctx.db, after),
    mapped: await listMappedMetaAccounts(ctx.db),
    listAccounts: (token) =>
      listMetaAccountsWithSpend({ token, budget: ctx.budget }),
    saveRun: (run, findings) => saveReconcileRun(ctx.db, run, findings),
    budget: ctx.budget,
    now: () => new Date(),
    deadline: ctx.deadline,
  });
  return {
    result: { phase: request.phase, ...check, api_calls: ctx.budget.used },
    next: check.done ? null : { phase: "accounts", cursor: check.next_cursor },
  };
}
