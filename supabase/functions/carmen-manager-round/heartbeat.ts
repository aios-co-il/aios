/** The heartbeat_logs row of a tenant's round (run_kind 'manager_round'). */
import type { TablesInsert } from "../_shared/database.types.ts";
import type { TenantReport } from "./tenant-run.ts";

/** True when the run collected, routed, briefed, sent or failed. */
export function hasActivity(report: TenantReport): boolean {
  return (
    !!report.error ||
    (report.collectors?.some((collector) => collector.status !== "skipped") ??
      false) ||
    (report.routed ?? 0) > 0 ||
    !!report.brief ||
    (report.dispatch?.messages ?? 0) > 0
  );
}

/** The heartbeat_logs row for a tenant run, with counts, LLM use and duration. */
export function roundLog(
  report: TenantReport,
  durationMs: number,
): TablesInsert<"heartbeat_logs"> {
  const collectors = report.collectors ?? [];
  const found = collectors.reduce(
    (sum, collector) => sum + collector.inserted,
    0,
  );
  const cleared = collectors.reduce(
    (sum, collector) => sum + collector.cleared,
    0,
  );
  const messages =
    (report.dispatch?.messages ?? 0) + (report.brief?.sent.length ?? 0);
  return {
    tenant_id: report.tenant_id,
    run_kind: "manager_round",
    status: report.error ? "error" : "ok",
    tasks_reviewed: report.routed ?? 0,
    summary: report.error
      ? `סבב כרמן נכשל: ${report.error.slice(0, 200)}`
      : `סבב כרמן (${report.mode}): ${found} ממצאים חדשים, ${cleared} נסגרו, ${messages} הודעות`,
    stats: {
      mode: report.mode,
      collectors: collectors.map(
        ({ id, status, candidates, inserted, cleared: done, reason }) => ({
          id,
          status,
          candidates,
          inserted,
          cleared: done,
          reason: reason ?? null,
        }),
      ),
      routed: report.routed ?? 0,
      gaps: report.gaps ?? 0,
      brief: report.brief
        ? report.brief.sent.map(({ key, status }) => ({ key, status }))
        : null,
      dispatch: report.dispatch ?? null,
    },
    llm_calls: collectors.reduce(
      (sum, collector) => sum + collector.llm.calls,
      0,
    ),
    llm_cost_usd: collectors.reduce(
      (sum, collector) => sum + collector.llm.costUsd,
      0,
    ),
    duration_ms: durationMs,
  };
}
