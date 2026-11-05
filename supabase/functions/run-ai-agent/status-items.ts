/**
 * get_reconciliation_status's lines (AIO-238): the latest run per report table
 * or tenant, and what it says.
 */
import { asRecord } from "../_shared/reconcile/json.ts";
import { isRateLimitRun } from "../_shared/reconcile/run-status.ts";
import type { scopedRuns } from "./status-runs.ts";

type StatusRun = Awaited<ReturnType<typeof scopedRuns>>[number];

/**
 * The newest run per key and, when a rate limit stopped that one, the newest
 * run before it that compared something.
 */
export function latestPerKey(runs: StatusRun[]) {
  const latest = new Map<string, StatusRun>();
  const previous = new Map<string, StatusRun>();
  for (const run of runs) {
    const key = runKey(run);
    const newest = latest.get(key);
    if (!newest) {
      latest.set(key, run);
    } else if (
      isRateLimitRun(newest) &&
      !previous.has(key) &&
      !isRateLimitRun(run)
    ) {
      previous.set(key, run);
    }
  }
  return { latest, previous };
}

/** One table's (or tenant's) line, with the previous result when a rate limit stopped the latest run. */
export function toStatusItem(run: StatusRun, previous: StatusRun | undefined) {
  const summary = asRecord(run.summary);
  return {
    client: run.clients?.name || null,
    client_id: run.client_id,
    table: run.crm_tables?.name || null,
    table_id: run.table_id,
    platform: run.platform,
    status: run.status,
    checked_at: run.finished_at || run.started_at,
    window: runWindow(run),
    counts: summary.counts || null,
    findings_total: summary.findings_total ?? null,
    persisting: summary.persisting || undefined,
    error: summary.error || summary.skipped_reason || null,
    top_findings: summary.top_findings || [],
    ...(isRateLimitRun(run)
      ? { rate_limited: true, previous: previousResult(previous) }
      : {}),
  };
}

/** The last result that compared something, for a table a rate limit kept from being checked. */
function previousResult(run: StatusRun | undefined) {
  if (!run) {
    return null;
  }
  const summary = asRecord(run.summary);
  return {
    status: run.status,
    checked_at: run.finished_at || run.started_at,
    window: runWindow(run),
    findings_total: summary.findings_total ?? null,
    top_findings: summary.top_findings || [],
  };
}

/** A table's runs share its id; tenant-level runs are keyed by tenant and platform. */
export function runKey(run: StatusRun): string {
  return run.table_id || `tenant:${run.tenant_id}:${run.platform}`;
}

/** "start – end" of the compared days, or null when nothing was compared. */
function runWindow(run: StatusRun): string | null {
  return run.window_start ? `${run.window_start} – ${run.window_end}` : null;
}

/** Gaps first, then failures, matches, and skipped runs last. */
export function rank(status: string): number {
  return STATUS_RANK.get(status) ?? 2;
}

const STATUS_RANK = new Map([
  ["mismatch", 0],
  ["failed", 1],
  ["skipped", 3],
]);
