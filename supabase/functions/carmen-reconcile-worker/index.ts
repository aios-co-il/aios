/**
 * carmen-reconcile-worker — nightly reconciliation of AIOS ad reports against
 * Meta and Google (AIO-238). Report-only: writes reconcile_runs and
 * reconcile_findings, never sends a message.
 *
 * Service role only. The nightly cron (01:30 UTC) calls it with no body; each
 * call reconciles a chunk of tables and queues the next chunk through
 * kick_internal_function until every table is done, tries once more the tables
 * a platform-wide rate limit made it pass over, then checks for Meta ad
 * accounts with spend that no client is mapped to.
 *
 * Body (all optional):
 *   cursor            continue after this crm_tables.id
 *   phase             "tables" (default) | "retry" | "accounts"
 *   deferred          table ids passed over for a rate limit (chained calls only)
 *   tenant_id, client_id, table_ids   on-demand scope (no chaining, no accounts phase)
 *   max_tables        tables per call (default 6, max 25)
 *   api_call_budget   platform requests per call (default 60, max 300)
 *   source: "fixture" + fixtures      canned platform data, non-production only;
 *                     needs table_ids, so it never overwrites other tables' results
 *
 * In the "tables" and "retry" phases `cursor` is a crm_tables.id; in the
 * "accounts" phase it is the last tenant whose Meta connections were fully
 * checked.
 */
import { kickNextBatch } from "../_shared/kick-next-batch.ts";
import { CallBudget } from "../_shared/reconcile/budget.ts";
import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import type { ChainStep } from "./chain.ts";
import { runPhase } from "./phases.ts";
import {
  isServiceRequest,
  json,
  MAX_HOPS,
  parseWorkerRequest,
  readJson,
  rejectInvalidRequest,
  type WorkerRequest,
} from "./request.ts";
import { pruneReconcileRuns } from "./store.ts";

const FUNCTION_NAME = "carmen-reconcile-worker";
const DEADLINE_MS = 110_000;
const RETENTION_DAYS = 90;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!isServiceRequest(req, serviceKey)) {
    return json({ error: "unauthorized" }, 401);
  }
  const request = parseWorkerRequest(await readJson(req));
  const startedMs = Date.now();
  const appEnv = Deno.env.get("APP_ENV");
  const invalid = rejectInvalidRequest(request, appEnv);
  if (invalid) {
    return json({ error: invalid }, 400);
  }

  const db = serviceClient();
  const budget = new CallBudget(request.apiCallBudget);
  try {
    await pruneOnFirstHop(db, request);
    const { result, next } = await runPhase(request, {
      db,
      budget,
      deadline: startedMs + DEADLINE_MS,
      appEnv,
      supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey,
    });
    await queueNext(db, request, next, result, budget);
    return json({
      ok: true,
      hop: request.hop,
      elapsed_ms: Date.now() - startedMs,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reconcile] worker failed:", message);
    return json({ ok: false, error: "reconcile worker failed" }, 500);
  }
});

/** The first call of the nightly chain drops runs past the retention period. */
async function pruneOnFirstHop(
  db: DbClient,
  request: WorkerRequest,
): Promise<void> {
  const firstHop =
    !request.scoped &&
    request.phase === "tables" &&
    request.cursor === null &&
    request.hop === 0;
  if (!firstHop) {
    return;
  }
  const before = new Date(
    Date.now() - RETENTION_DAYS * 86_400_000,
  ).toISOString();
  await pruneReconcileRuns(db, before);
}

/** Queues the nightly chain's next call (up to MAX_HOPS) and notes it in `result`. */
async function queueNext(
  db: DbClient,
  request: WorkerRequest,
  next: ChainStep | null,
  result: Record<string, unknown>,
  budget: CallBudget,
): Promise<void> {
  const chain = !request.scoped && !request.useFixture && request.chain;
  if (!next || !chain) {
    return;
  }
  if (request.hop >= MAX_HOPS) {
    console.warn(`[reconcile] stopped after ${request.hop} hops`);
    result.hop_limit_reached = true;
    return;
  }
  await kickNextBatch(db, FUNCTION_NAME, {
    ...next,
    hop: request.hop + 1,
    max_tables: request.maxTables,
    api_call_budget: budget.limit,
  });
  result.queued_next = next;
}
