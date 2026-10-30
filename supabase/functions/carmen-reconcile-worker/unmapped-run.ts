/**
 * A tenant's unmapped-accounts check as the reconcile_runs row the worker
 * stores (AIO-238).
 */
import { MAX_FINDINGS_PER_TABLE } from "../_shared/reconcile/reconcile-table.ts";
import type {
  ReconcileFinding,
  RunStatus,
} from "../_shared/reconcile/types.ts";
import type { StoredRun } from "./store.ts";
import type { TenantConnections } from "./unmapped-accounts-db.ts";

/** What scanning one tenant's connections found. */
export type TenantScan = {
  findings: ReconcileFinding[];
  errors: string[];
  accountsSeen: number;
  complete: boolean;
};

/** The tenant-level run, and the findings kept for it (biggest spend first). */
export function unmappedRun(
  group: TenantConnections,
  scan: TenantScan,
  startedAt: Date,
  finishedAt: Date,
): { run: StoredRun; kept: ReconcileFinding[] } {
  // Only staff members' private connections, which this check never reads:
  // say so rather than store an "ok" that covered nothing.
  const noOrgConnections = group.connections.length === 0;
  const status = unmappedRunStatus(scan, noOrgConnections);
  const kept = scan.findings
    .sort((a, b) => (b.platform_value ?? 0) - (a.platform_value ?? 0))
    .slice(0, MAX_FINDINGS_PER_TABLE);
  const skippedReason = noOrgConnections ? "no_org_connections" : "incomplete";
  const run: StoredRun = {
    tenant_id: group.tenant_id,
    table_id: null,
    client_id: null,
    platform: "meta",
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    status,
    window_start: null,
    window_end: null,
    summary: {
      check: "unmapped_accounts",
      connections: group.connections.length,
      accounts_seen: scan.accountsSeen,
      counts: { unmapped_account: scan.findings.length },
      findings_total: scan.findings.length,
      unmapped_check: noOrgConnections ? "no_org_connections" : undefined,
      incomplete: scan.complete ? undefined : true,
      skipped_reason: status === "skipped" ? skippedReason : undefined,
      errors: scan.errors.length ? scan.errors.slice(0, 3) : undefined,
      top_findings: kept.slice(0, 5).map((f) => ({
        kind: f.kind,
        campaign: f.details.account_name || f.details.account_id || null,
        date: null,
        metric: f.metric,
        aios: 0,
        platform: f.platform_value,
      })),
    },
  };
  return { run, kept };
}

/** mismatch when anything was found; skipped when the check could not cover the tenant. */
function unmappedRunStatus(
  scan: TenantScan,
  noOrgConnections: boolean,
): RunStatus {
  if (scan.findings.length) {
    return "mismatch";
  }
  if (!scan.complete || noOrgConnections) {
    return "skipped";
  }
  if (scan.errors.length && !scan.accountsSeen) {
    return "failed";
  }
  return "ok";
}
