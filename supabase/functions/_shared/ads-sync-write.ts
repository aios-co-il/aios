/**
 * Database side of the ads report syncs: replace one fetched window in
 * crm_records, then record the run on crm_tables (see sync-outcome.ts).
 *
 * The clients are duck-typed so the same code runs with supabase-js in Deno and
 * with an in-memory fake in the Deno tests.
 */
import {
  replacedRecordsFilter,
  resolvePruneStart,
  type SyncWindow,
} from "./report-sync-window.ts";
import {
  ADS_LEVELS,
  finalizeSyncOutcome,
  isWriteSuccess,
  planLevelWrite,
  redactSyncError,
  settingsMirrorOutcome,
  type AdsLevel,
  type LevelWritePlan,
  type SyncOutcome,
} from "./sync-outcome.ts";
import { CAMPAIGN_LEVEL_FILTER } from "./pulse-inputs.ts";

type DbError = { message?: string } | null;
type DbResult = PromiseLike<{ error: DbError; data?: unknown }>;
type Filterable = { eq(column: string, value: unknown): FilterChain };
type FilterChain = DbResult & {
  or(filter: string): DbResult & { limit(count: number): DbResult };
  maybeSingle(): DbResult;
};
type TableApi = {
  select(columns: string): Filterable;
  update(values: Record<string, unknown>): Filterable;
  delete(): Filterable;
  insert(rows: Record<string, unknown>[]): DbResult;
};
export type SyncDbClient = { from(table: string): TableApi };

const INSERT_CHUNK = 500;

/**
 * PostgREST `or` expression for the rows a run replaces: the window's days (see
 * replacedRecordsFilter), limited to the levels that were fetched. A row without
 * `entity_level` is a campaign row. With every level fetched it is the plain
 * date filter, so stray rows of any level are still swept.
 */
export function replacedLevelRecordsFilter(
  pruneStart: string,
  levels: readonly AdsLevel[],
): string {
  const dateFilter = replacedRecordsFilter(pruneStart);
  const kept = ADS_LEVELS.filter((level) => levels.includes(level));
  if (kept.length === ADS_LEVELS.length) return dateFilter;
  if (!kept.length) throw new Error("replacedLevelRecordsFilter: no levels");
  const named = `data->>entity_level.in.(${kept.join(",")})`;
  const levelFilter = kept.includes("campaign")
    ? `or(data->>entity_level.is.null,${named})`
    : named;
  return `and(${levelFilter},or(${dateFilter}))`;
}

/**
 * An empty fetch is a data problem only when the store already holds campaign
 * rows for those days: delivery does not un-happen, so the platform dropped data
 * (a hiccup) and the run stays `empty`. With nothing stored either, the platform
 * confirms there was no delivery in the window (Shabbat, a paused account, a
 * today-only window before the first impression): nothing to replace, and the run
 * is a clean `ok` with 0 rows. A failed check keeps `empty`.
 */
export async function confirmEmptyPlan(
  client: SyncDbClient,
  input: { tableId: string; window: SyncWindow; plan: LevelWritePlan },
): Promise<LevelWritePlan> {
  if (input.plan.status !== "empty") return input.plan;
  const { startDate, endDate } = input.window;
  const { data, error } = await client
    .from("crm_records")
    .select("id")
    .eq("table_id", input.tableId)
    .or(
      `and(or(${CAMPAIGN_LEVEL_FILTER}),data->>date.gte.${startDate},data->>date.lte.${endDate})`,
    )
    .limit(1);
  if (error || !Array.isArray(data) || data.length > 0) return input.plan;
  return { ...input.plan, status: "ok" };
}

/**
 * One fetched window, end to end: decide what may be replaced (planLevelWrite,
 * confirmEmptyPlan), replace it, and return the run's outcome.
 */
export async function syncAdsWindow(
  clients: { deleteClient: SyncDbClient; insertClient?: SyncDbClient },
  input: {
    tableId: string;
    tenantId: string;
    createdBy?: string | null;
    window: SyncWindow;
    records: Array<{ date?: unknown }>;
    levelCounts: Partial<Record<AdsLevel, number>>;
    levelErrors?: Partial<Record<AdsLevel, string | null | undefined>>;
    source: string;
    at?: string;
  },
): Promise<SyncOutcome> {
  const plan = await confirmEmptyPlan(clients.deleteClient, {
    tableId: input.tableId,
    window: input.window,
    plan: planLevelWrite(input),
  });
  const written = plan.write
    ? await writeAdsWindow(clients, { ...input, levelsOk: plan.levelsOk })
    : null;
  return finalizeSyncOutcome(plan, written, {
    source: input.source,
    at: input.at,
  });
}

/**
 * Replace the window's rows for `levelsOk` with `records`. Stops at the first
 * error: a failed delete inserts nothing (no duplicates), a failed insert chunk
 * reports how many rows made it in.
 */
export async function writeAdsWindow(
  clients: { deleteClient: SyncDbClient; insertClient?: SyncDbClient },
  input: {
    tableId: string;
    tenantId: string;
    createdBy?: string | null;
    window: SyncWindow;
    records: Array<{ date?: unknown }>;
    levelsOk: readonly AdsLevel[];
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
 * Store a finished run on crm_tables.
 *
 * - `last_sync_at` (column + settings) moves only after a successful write.
 * - `last_sync_attempt_at` / `last_sync_outcome` are recorded on every run (column
 *   + settings mirror). A catch-up chunk records only a failure: the refresh run
 *   that follows owns the outcome.
 * - The error text goes to the column only, redacted: the settings mirror has no
 *   `error`, because the public share-link endpoints return the settings verbatim.
 * - `settingsPatch` is merged into the latest settings, not the copy the run
 *   started with, so concurrent edits (currency etc.) survive.
 */
export async function saveSyncRun(
  client: SyncDbClient,
  tableId: string,
  opts: {
    outcome: SyncOutcome;
    catchup?: boolean;
    settingsPatch?: Record<string, unknown>;
    fallbackSettings?: Record<string, unknown> | null;
    log?: (message: string) => void;
  },
): Promise<{ lastSyncAt: string | null; recorded: boolean }> {
  const outcome: SyncOutcome = opts.outcome.error
    ? { ...opts.outcome, error: redactSyncError(opts.outcome.error) }
    : opts.outcome;
  const log = opts.log || ((message: string) => console.error(message));
  const stamp = isWriteSuccess(outcome.status) && !opts.catchup;
  const record = !opts.catchup || outcome.status === "failed";
  const patch: Record<string, unknown> = { ...(opts.settingsPatch || {}) };
  if (stamp) patch.last_sync_at = outcome.at;
  if (record) {
    patch.last_sync_attempt_at = outcome.at;
    patch.last_sync_outcome = settingsMirrorOutcome(outcome);
  }

  if (Object.keys(patch).length > 0) {
    const { data: fresh } = await client
      .from("crm_tables")
      .select("integration_settings")
      .eq("id", tableId)
      .maybeSingle();
    const current = ((fresh as { integration_settings?: unknown } | null)
      ?.integration_settings ||
      opts.fallbackSettings ||
      {}) as Record<string, unknown>;
    const { error } = await client
      .from("crm_tables")
      .update({
        integration_settings: { ...current, ...patch },
        ...(stamp ? { last_sync_at: outcome.at } : {}),
      })
      .eq("id", tableId);
    if (error) log(`[sync-outcome] settings update failed: ${error.message}`);
  }

  if (record) {
    // Separate write: until the columns exist this fails alone, never the stamp above.
    const { error } = await client
      .from("crm_tables")
      .update({
        last_sync_attempt_at: outcome.at,
        last_sync_outcome: outcome,
      })
      .eq("id", tableId);
    if (error)
      log(`[sync-outcome] outcome columns update failed: ${error.message}`);
  }
  return { lastSyncAt: stamp ? outcome.at : null, recorded: record };
}
