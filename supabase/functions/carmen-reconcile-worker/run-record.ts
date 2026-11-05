/**
 * A table's result as the reconcile_runs row the worker stores (AIO-238).
 */
import type {
  TableReconcileResult,
  TopFinding,
} from "../_shared/reconcile/run-summary.ts";
import type {
  ReconcileFinding,
  ReconcileTable,
} from "../_shared/reconcile/types.ts";
import type { StoredRun } from "./store.ts";

/** The run row for `result`, with its first five findings in the summary. */
export function runRecord(
  table: ReconcileTable,
  result: TableReconcileResult,
  startedAt: Date,
  finishedAt: Date,
): StoredRun {
  return {
    tenant_id: table.tenant_id,
    table_id: table.id,
    client_id: table.client_id,
    platform: result.platform,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    status: result.status,
    window_start: result.window_start,
    window_end: result.window_end,
    summary: {
      ...result.summary,
      top_findings: result.findings.slice(0, 5).map(compactFinding),
    },
  };
}

/** A finding as the summary lists it, named by its campaign. */
function compactFinding(f: ReconcileFinding): TopFinding {
  return {
    kind: f.kind,
    campaign: f.details.campaign_name || f.campaign_id,
    date: f.date,
    metric: f.metric,
    aios: f.aios_value,
    platform: f.platform_value,
  };
}
