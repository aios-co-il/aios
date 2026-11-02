/**
 * Where the worker keeps its results: reconcile_runs and reconcile_findings
 * (AIO-238). Service role only.
 */
import { isRateLimitRun } from "../_shared/reconcile/run-status.ts";
import type { RunSummary } from "../_shared/reconcile/run-summary.ts";
import type {
  ReconcileFinding,
  RunStatus,
} from "../_shared/reconcile/types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** A finished run as stored in reconcile_runs. */
export type StoredRun = {
  tenant_id: string;
  table_id: string | null;
  client_id: string | null;
  platform: string | null;
  started_at: string;
  finished_at: string;
  status: RunStatus;
  window_start: string | null;
  window_end: string | null;
  summary: RunSummary;
};

/** The fields of an earlier run the next one compares against. */
export type LatestRun = {
  status: string;
  started_at: string;
  summary: unknown;
};

const FINDINGS_BATCH = 500;

/** Insert a finished run and its findings; returns the run id. */
export async function saveReconcileRun(
  db: Pick<DbClient, "from">,
  run: StoredRun,
  findings: ReconcileFinding[],
): Promise<string> {
  const { data, error } = await db
    .from("reconcile_runs")
    .insert(run)
    .select("id")
    .single();
  if (error) {
    throw new Error(`reconcile_runs: ${error.message}`);
  }
  const rows = findings.map((f) => ({
    run_id: data.id,
    tenant_id: run.tenant_id,
    client_id: run.client_id,
    table_id: run.table_id,
    campaign_id: f.campaign_id,
    date: f.date,
    kind: f.kind,
    metric: f.metric,
    aios_value: f.aios_value,
    platform_value: f.platform_value,
    details: f.details,
  }));
  for (let i = 0; i < rows.length; i += FINDINGS_BATCH) {
    const { error: findErr } = await db
      .from("reconcile_findings")
      .insert(rows.slice(i, i + FINDINGS_BATCH));
    if (findErr) {
      throw new Error(`reconcile_findings: ${findErr.message}`);
    }
  }
  return data.id;
}

/** The table's latest run that compared something (rate-limited runs are passed over). */
export async function latestRunForTable(
  db: Pick<DbClient, "from">,
  tableId: string,
): Promise<LatestRun | null> {
  const { data, error } = await db
    .from("reconcile_runs")
    .select("status, started_at, summary")
    .eq("table_id", tableId)
    .order("started_at", { ascending: false })
    .limit(10);
  if (error) {
    throw new Error(`reconcile_runs: ${error.message}`);
  }
  return (data || []).find((run) => !isRateLimitRun(run)) || null;
}

/** Drop runs (and, by cascade, their findings) older than `beforeIso`. */
export async function pruneReconcileRuns(
  db: Pick<DbClient, "from">,
  beforeIso: string,
): Promise<void> {
  const { error } = await db
    .from("reconcile_runs")
    .delete()
    .lt("started_at", beforeIso);
  if (error) {
    console.warn("[reconcile] prune failed:", error.message);
  }
}
