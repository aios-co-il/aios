/**
 * The stored runs get_reconciliation_status reads (AIO-238): one query per
 * part of the caller's scope, merged newest first.
 */
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { ReconcileStatusScope } from "./status-scope.ts";

const STATUS_RUN_COLUMNS =
  "id, tenant_id, client_id, table_id, platform, status, started_at, finished_at, window_start, window_end, summary, crm_tables(name), clients(name)";

const STATUS_RUN_LIMIT = 2000;

/** Shared-agency client ids per query, to keep the URL short. */
const CLIENT_ID_CHUNK = 150;

/** Runs since `sinceIso` the scope allows (one client's table runs when `clientId` is set), newest first. */
export async function scopedRuns(
  db: Pick<DbClient, "from">,
  scope: ReconcileStatusScope,
  clientId: string | null,
  sinceIso: string,
) {
  const base = () =>
    db
      .from("reconcile_runs")
      .select(STATUS_RUN_COLUMNS)
      .gte("started_at", sinceIso);
  const fetchRuns = async (q: ReturnType<typeof base>) => {
    const { data, error } = await q
      .order("started_at", { ascending: false })
      .limit(STATUS_RUN_LIMIT);
    if (error) {
      throw new Error(`reconcile_runs: ${error.message}`);
    }
    return data || [];
  };
  let runs: Awaited<ReturnType<typeof fetchRuns>>;
  if (clientId) {
    runs = await fetchRuns(
      base().eq("client_id", clientId).not("table_id", "is", null),
    );
  } else {
    let own = base().eq("tenant_id", scope.ownTenantId);
    if (!scope.includeTenantLevel) {
      own = own.not("table_id", "is", null);
    }
    runs = await fetchRuns(own);
    for (let i = 0; i < scope.sharedClientIds.length; i += CLIENT_ID_CHUNK) {
      const chunk = scope.sharedClientIds.slice(i, i + CLIENT_ID_CHUNK);
      runs = runs.concat(
        await fetchRuns(
          base().in("client_id", chunk).not("table_id", "is", null),
        ),
      );
    }
  }
  const seen = new Set<string>();
  return runs
    .filter((r) => {
      if (seen.has(r.id)) {
        return false;
      }
      seen.add(r.id);
      return true;
    })
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}
