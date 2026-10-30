/**
 * What one "tables" or "retry" call runs on (AIO-238): the store, the platform
 * source for each table, and the resync trigger.
 */
import type { CallBudget } from "../_shared/reconcile/budget.ts";
import { createMetaSource } from "../_shared/reconcile/meta-source.ts";
import { resolveMetaToken } from "../_shared/reconcile/meta-token.ts";
import { platformFor } from "../_shared/reconcile/run-status.ts";
import {
  listReconcileTables,
  readAiosCampaignRows,
} from "../_shared/reconcile/tables.ts";
import type {
  PlatformSource,
  ReconcileTable,
} from "../_shared/reconcile/types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { ChunkDeps, ReconcileStore } from "./chunk-types.ts";
import { createFixtureSource } from "./fixture-source.ts";
import { resolveGoogleAuth } from "./google-auth.ts";
import { createGoogleSource } from "./google-source.ts";
import type { WorkerRequest } from "./request.ts";
import { createResyncTrigger } from "./resync.ts";
import { latestRunForTable, saveReconcileRun } from "./store.ts";

export type WorkerContext = {
  db: DbClient;
  budget: CallBudget;
  deadline: number;
  appEnv: string | undefined;
  supabaseUrl: string;
  serviceKey: string;
};

/** Dependencies of a chunk for this request. Fixture runs never touch real syncs. */
export function chunkDeps(
  ctx: WorkerContext,
  request: WorkerRequest,
): ChunkDeps {
  return {
    store: workerStore(ctx.db, request),
    sourceFor: sourcePicker(ctx, request),
    budget: ctx.budget,
    now: () => new Date(),
    deadline: ctx.deadline,
    triggerResync: request.useFixture
      ? undefined
      : createResyncTrigger(ctx.supabaseUrl, ctx.serviceKey),
    log: (m) => console.log(m),
  };
}

/** The tables of this request (the deferred ones in the retry phase) and where runs are stored. */
function workerStore(db: DbClient, request: WorkerRequest): ReconcileStore {
  return {
    listTables: ({ afterId, limit }) =>
      listReconcileTables(db, {
        afterId,
        limit,
        tenantIds: request.tenantId ? [request.tenantId] : null,
        clientId: request.clientId,
        tableIds:
          request.phase === "retry" ? request.deferred : request.tableIds,
      }),
    readAios: (table, start, end) =>
      readAiosCampaignRows(db, table.id, start, end),
    latestRun: (tableId) => latestRunForTable(db, tableId),
    saveRun: (run, findings) => saveReconcileRun(db, run, findings),
  };
}

/** The fixture source when asked for, else Meta or Google by the table's type. */
function sourcePicker(
  ctx: WorkerContext,
  request: WorkerRequest,
): (table: ReconcileTable) => PlatformSource {
  const fixture = request.useFixture
    ? createFixtureSource(request.fixtures, ctx.appEnv)
    : null;
  const google = {
    developerToken: Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "",
    clientId: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
  };
  const meta = createMetaSource({
    getToken: (table) => resolveMetaToken(ctx.db, table),
    budget: ctx.budget,
  });
  const googleSource = createGoogleSource({
    getAuth: (table) => resolveGoogleAuth(ctx.db, table, google, ctx.budget),
    budget: ctx.budget,
  });
  return (table) => {
    if (fixture) {
      return fixture;
    }
    return platformFor(table.integration_type) === "google"
      ? googleSource
      : meta;
  };
}
