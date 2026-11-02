/**
 * Database side of the ads report syncs: replace one fetched window in
 * crm_records (level-plan.ts decides what may be replaced).
 *
 * The clients are duck-typed so the same code runs with supabase-js in Deno and
 * with an in-memory fake in the Deno tests.
 */
import {
  replacedRecordsFilter,
  resolvePruneStart,
  type SyncWindow,
} from "../report-sync-window.ts";
import { CAMPAIGN_LEVEL_FILTER } from "./campaign-records.ts";
import {
  finalizeSyncOutcome,
  planLevelWrite,
  type LevelWritePlan,
} from "./level-plan.ts";
import { ADS_LEVELS, type AdsEntityLevel } from "./levels.ts";
import type { SyncOutcome } from "./outcome.ts";

type DbError = { message?: string } | null;
type DbResult = PromiseLike<{ error: DbError; data?: unknown }>;
type FilterChain = DbResult & {
  eq(column: string, value: unknown): FilterChain;
  or(filter: string): DbResult & { limit(count: number): DbResult };
  maybeSingle(): DbResult;
};
type TableApi = {
  select(columns: string): FilterChain;
  update(values: Record<string, unknown>): FilterChain;
  delete(): FilterChain;
  insert(rows: Record<string, unknown>[]): DbResult;
};
export type SyncDbClient = { from(table: string): TableApi };

/**
 * A client as callers pass it: supabase-js or a test fake. The entry points
 * take this and narrow it with asSyncDbClient, because checking a whole
 * supabase-js client against SyncDbClient exceeds TypeScript's instantiation
 * depth (TS2589).
 */
export type SyncClient = { from(table: string): unknown };

/** The duck-typed view the helpers use; `from` returns the PostgREST builder. */
export function asSyncDbClient(client: SyncClient): SyncDbClient {
  return client as SyncDbClient;
}

type WindowClients = {
  deleteClient: SyncClient;
  insertClient?: SyncClient;
};

type DbClients = {
  deleteClient: SyncDbClient;
  insertClient?: SyncDbClient;
};

const INSERT_CHUNK = 500;

/**
 * One fetched window, end to end: decide what may be replaced (planLevelWrite,
 * confirmEmptyPlan), replace it, and return the run's outcome.
 */
export async function syncAdsWindow(
  clients: WindowClients,
  input: {
    tableId: string;
    tenantId: string;
    createdBy?: string | null;
    window: SyncWindow;
    records: Array<{ date?: unknown }>;
    levelCounts: Partial<Record<AdsEntityLevel, number>>;
    levelErrors?: Partial<Record<AdsEntityLevel, string | null | undefined>>;
    source: string;
    at?: string;
  },
): Promise<SyncOutcome> {
  const db: DbClients = {
    deleteClient: asSyncDbClient(clients.deleteClient),
    insertClient: clients.insertClient && asSyncDbClient(clients.insertClient),
  };
  const plan = await confirmEmptyPlan(db.deleteClient, {
    tableId: input.tableId,
    window: input.window,
    plan: planLevelWrite(input),
  });
  const written = plan.write
    ? await writeAdsWindow(db, { ...input, levelsOk: plan.levelsOk })
    : null;
  return finalizeSyncOutcome(plan, written, {
    source: input.source,
    at: input.at,
  });
}

/**
 * Replace the window's rows for `levelsOk` with `records`. Stops at the first
 * error: a failed delete inserts nothing (no duplicates), a failed insert chunk
 * reports how many rows made it in. The delete is scoped by table_id only on
 * purpose: rows left under a previous tenant_id (shared-agency tables) must be
 * swept, or they inflate the report totals forever.
 */
export async function writeAdsWindow(
  clients: DbClients,
  input: {
    tableId: string;
    tenantId: string;
    createdBy?: string | null;
    window: SyncWindow;
    records: Array<{ date?: unknown }>;
    levelsOk: readonly AdsEntityLevel[];
    chunkSize?: number;
  },
): Promise<{ inserted: number; error?: string }> {
  const pruneStart = resolvePruneStart(
    input.window,
    input.records.map((record) =>
      typeof record.date === "string" ? record.date : null,
    ),
  );
  const { error: deleteError } = await clients.deleteClient
    .from("crm_records")
    .delete()
    .eq("table_id", input.tableId)
    .or(replacedLevelRecordsFilter(pruneStart, input.levelsOk));
  if (deleteError) {
    return { inserted: 0, error: `delete: ${deleteError.message || "error"}` };
  }

  const insertClient = clients.insertClient || clients.deleteClient;
  const rows = input.records.map((record) => ({
    table_id: input.tableId,
    tenant_id: input.tenantId,
    created_by: input.createdBy ?? null,
    data: record,
  }));
  const chunk = input.chunkSize || INSERT_CHUNK;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await insertClient.from("crm_records").insert(slice);
    if (error) {
      return { inserted, error: `insert: ${error.message || "error"}` };
    }
    inserted += slice.length;
  }
  return { inserted };
}

/**
 * An empty fetch is a data problem only when the store already holds campaign
 * rows for those days: delivery does not un-happen, so the platform dropped data
 * (a hiccup) and the run stays `empty`. With nothing stored either, the platform
 * confirms there was no delivery in the window (Shabbat, a paused account, a
 * today-only window before the first impression): nothing to replace, and the run
 * is a clean `ok` with 0 rows. A failed check keeps `empty`. Scoped by table_id
 * only on purpose, like the delete in writeAdsWindow.
 */
export async function confirmEmptyPlan(
  client: SyncDbClient,
  input: { tableId: string; window: SyncWindow; plan: LevelWritePlan },
): Promise<LevelWritePlan> {
  if (input.plan.status !== "empty") {
    return input.plan;
  }
  const { startDate, endDate } = input.window;
  const { data, error } = await client
    .from("crm_records")
    .select("id")
    .eq("table_id", input.tableId)
    .or(
      `and(or(${CAMPAIGN_LEVEL_FILTER}),data->>date.gte.${startDate},data->>date.lte.${endDate})`,
    )
    .limit(1);
  if (error) {
    console.error(
      `[sync-outcome] empty-window check failed, run stays empty: ${error.message || "error"}`,
    );
    return input.plan;
  }
  return Array.isArray(data) && data.length === 0
    ? { ...input.plan, status: "ok" }
    : input.plan;
}

/**
 * PostgREST `or` expression for the rows a run replaces: the window's days (see
 * replacedRecordsFilter), limited to the levels that were fetched. A row without
 * `entity_level` is a campaign row. With every level fetched it is the plain
 * date filter, so stray rows of any level are still swept.
 */
export function replacedLevelRecordsFilter(
  pruneStart: string,
  levels: readonly AdsEntityLevel[],
): string {
  const dateFilter = replacedRecordsFilter(pruneStart);
  const kept = ADS_LEVELS.filter((level) => levels.includes(level));
  if (kept.length === ADS_LEVELS.length) {
    return dateFilter;
  }
  if (!kept.length) {
    throw new Error("replacedLevelRecordsFilter: no levels");
  }
  const named = `data->>entity_level.in.(${kept.join(",")})`;
  const levelFilter = kept.includes("campaign")
    ? `or(data->>entity_level.is.null,${named})`
    : named;
  return `and(${levelFilter},or(${dateFilter}))`;
}
