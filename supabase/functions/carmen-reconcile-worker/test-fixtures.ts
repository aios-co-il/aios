/**
 * Test helpers for the worker's tests (not imported by the worker): report
 * tables, campaign rows and an in-memory store (AIO-238).
 */
import { CallBudget } from "../_shared/reconcile/budget.ts";
import type {
  CampaignDayRow,
  ListedTable,
  PlatformSource,
  ReconcileFinding,
} from "../_shared/reconcile/types.ts";
import type { ChunkDeps, ReconcileStore } from "./chunk-types.ts";
import type { StoredRun } from "./store.ts";

export const NOW = new Date("2026-10-26T01:30:00Z");

export const account = {
  account_id: "act_1",
  timezone: "UTC",
  currency: "ILS",
};

export type SavedRun = { run: StoredRun; findings: ReconcileFinding[] };

/** An active client's report table, synced after Oct 25 ended. */
export function table(
  id: string,
  type = "facebook_insights",
  extra: Partial<ListedTable> = {},
): ListedTable {
  return {
    id,
    tenant_id: "tenant-1",
    client_id: `client-${id}`,
    integration_type: type,
    integration_settings: {},
    client_name: null,
    client_status: "active",
    agency_name: null,
    last_sync_at: "2026-10-25T23:00:00Z",
    ...extra,
  };
}

/** One campaign's spend on Oct 20. */
export function day(campaign: string, spend: number): CampaignDayRow {
  return {
    campaign_id: campaign,
    campaign_name: `C${campaign}`,
    date: "2026-10-20",
    data: { date: "2026-10-20", campaign_id: campaign, spend },
  };
}

/** A store over `tables` and stored rows, whose previous run per table has the status in `previous`. */
export function memoryStore(
  tables: ListedTable[],
  aios: Record<string, CampaignDayRow[]>,
  previous: Record<string, string> = {},
) {
  const saved: SavedRun[] = [];
  const store: ReconcileStore = {
    listTables: ({ afterId, limit }) =>
      Promise.resolve(
        tables
          .filter((t) => !afterId || t.id > afterId)
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, limit),
      ),
    readAios: (t) => Promise.resolve(aios[t.id] || []),
    latestRun: (id) =>
      Promise.resolve(
        previous[id]
          ? { status: previous[id], started_at: "x", summary: {} }
          : null,
      ),
    saveRun: (run, findings) => {
      saved.push({ run, findings });
      return Promise.resolve(`run-${saved.length}`);
    },
  };
  return { store, saved };
}

/** Chunk dependencies with one source for every table and a minute to spare. */
export function deps(
  store: ReconcileStore,
  source: PlatformSource,
  budget = new CallBudget(100),
  extra: Partial<ChunkDeps> = {},
): ChunkDeps {
  return {
    store,
    sourceFor: () => source,
    budget,
    now: () => NOW,
    deadline: Date.now() + 60_000,
    ...extra,
  };
}
