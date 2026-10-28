/** The heartbeat_logs row of a tenant's round (MANAGER_ROUND_RUN_KIND). */
import type { TablesInsert } from "../_shared/database.types.ts";
import { MANAGER_ROUND_RUN_KIND } from "../_shared/manager-round/run-kind.ts";
import { unexpectedDrops } from "./findings/dropped.ts";
import type { TenantReport } from "./tenant-run.ts";

/** True when the run collected, routed, lost a routing gap, briefed, sent or failed. */
export function hasActivity(report: TenantReport): boolean {
  return (
    !!report.error ||
    (report.collectors?.some((collector) => collector.status !== "skipped") ??
      false) ||
    (report.routed ?? 0) > 0 ||
    unexpectedDrops(report.gaps_dropped ?? {}) > 0 ||
    !!report.brief ||
    (report.dispatch?.messages ?? 0) > 0
  );
}

/**
 * The heartbeat_logs row for a tenant run, with counts (candidates the
 * database did not store among them), LLM use (the chat and group update
 * collectors, AIO-252 and AIO-254) and duration.
 */
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
  const notStored = [
    ...collectors.map((collector) => collector.dropped),
    report.gaps_dropped ?? {},
  ].reduce((sum, counts) => sum + unexpectedDrops(counts), 0);
  const notStoredText = notStored ? `, ${notStored} לא נשמרו` : "";
  return {
    tenant_id: report.tenant_id,
    run_kind: MANAGER_ROUND_RUN_KIND,
    status: report.error ? "error" : "ok",
    tasks_reviewed: report.routed ?? 0,
    summary: report.error
      ? `סבב כרמן נכשל: ${report.error.slice(0, 200)}`
      : `סבב כרמן (${report.mode}): ${found} ממצאים חדשים, ${cleared} נסגרו, ${messages} הודעות${notStoredText}`,
    stats: {
      mode: report.mode,
      collectors: collectors.map(
        ({
          id,
          status,
          candidates,
          inserted,
          cleared: done,
          dropped,
          reason,
        }) => ({
          id,
          status,
          candidates,
          inserted,
          cleared: done,
          dropped,
          reason: reason ?? null,
        }),
      ),
      routed: report.routed ?? 0,
      gaps: report.gaps ?? 0,
      gaps_dropped: report.gaps_dropped ?? {},
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
