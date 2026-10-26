/**
 * Chunked driver for the nightly reconciliation (AIO-238). One worker call
 * reconciles report tables in id order after `cursor` until it hits its table
 * count, API-call budget or wall-clock deadline, then hands back the cursor for
 * the next call. After the last table it can list Meta ad accounts with spend
 * that no client is mapped to.
 *
 * Report-only: it stores runs and findings and never sends anything. The
 * optional auto-resync (crm_tables.integration_settings.reconcile_autoresync,
 * off by default) asks the table's own sync function to re-fetch the window
 * once, outside the morning/afternoon refresh windows.
 */
import {
  type AiosReader,
  type CallBudget,
  MAX_FINDINGS_PER_TABLE,
  type PlatformSource,
  platformFor,
  RECONCILE_TOLERANCE,
  type ReconcileFinding,
  type ReconcilePlatform,
  ReconcileSourceError,
  type ReconcileTable,
  reconcileTable,
  redactSecrets,
  type RunStatus,
  type TableReconcileResult,
} from "./reconcile-core.ts";

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
  summary: Record<string, unknown>;
};

export type RunnerTable = ReconcileTable & { client_status?: string | null };

export interface ReconcileStore {
  listTables(opts: {
    afterId: string | null;
    limit: number;
  }): Promise<RunnerTable[]>;
  readAios: AiosReader;
  latestRun(tableId: string): Promise<{
    status: string;
    started_at: string;
    summary: Record<string, unknown>;
  } | null>;
  saveRun(run: StoredRun, findings: ReconcileFinding[]): Promise<string>;
}

/** Sync + snapshot refresh windows (UTC): syncs run 02:40–02:50 and 11:40–11:50, the pulse refresh at 04:00 and 13:00. */
export const REFRESH_WINDOWS_UTC: Array<[number, number]> = [
  [2 * 60 + 30, 4 * 60 + 30],
  [11 * 60 + 30, 13 * 60 + 30],
];

export function insideRefreshWindow(now: Date): boolean {
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return REFRESH_WINDOWS_UTC.some(
    ([from, to]) => minute >= from && minute < to,
  );
}

/** Calls one table needs at minimum: Meta = account + campaigns + adsets + insights. */
const MIN_CALLS: Record<ReconcilePlatform, number> = { meta: 4, google: 3 };

export type ResyncTrigger = (
  table: ReconcileTable,
  window: { start: string; end: string },
) => Promise<{ ok: boolean; status?: number; error?: string }>;

export type ProcessedTable = {
  table_id: string;
  status: RunStatus;
  findings: number;
  error_kind?: string;
  run_id?: string;
  save_error?: string;
  resync?: Record<string, unknown>;
};

export type ChunkResult = {
  processed: ProcessedTable[];
  next_cursor: string | null;
  done: boolean;
  stopped: "budget" | "deadline" | "max_tables" | null;
  api_calls: number;
};

const compactFinding = (f: ReconcileFinding) => ({
  kind: f.kind,
  campaign: (f.details?.campaign_name as string) || f.campaign_id,
  date: f.date,
  metric: f.metric,
  aios: f.aios_value,
  platform: f.platform_value,
});

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

function skippedResult(
  table: ReconcileTable,
  reason: string,
): TableReconcileResult {
  return {
    status: "skipped",
    platform: platformFor(table.integration_type),
    window_start: null,
    window_end: null,
    findings: [],
    summary: { skipped_reason: reason },
  };
}

export async function runReconcileChunk(
  deps: {
    store: ReconcileStore;
    sourceFor: (table: ReconcileTable) => PlatformSource;
    budget: CallBudget;
    now: () => Date;
    deadline: number;
    triggerResync?: ResyncTrigger;
    log?: (message: string) => void;
  },
  opts: { cursor: string | null; maxTables: number },
): Promise<ChunkResult> {
  const { store, budget } = deps;
  const log = deps.log || (() => {});
  const fetchLimit = Math.max(opts.maxTables * 4, 20);
  const tables = await store.listTables({
    afterId: opts.cursor,
    limit: fetchLimit,
  });
  const processed: ProcessedTable[] = [];
  const rateLimited = new Set<ReconcilePlatform>();
  let cursor = opts.cursor;
  let stopped: ChunkResult["stopped"] = null;
  let considered = 0;

  for (const table of tables) {
    if (processed.length >= opts.maxTables) {
      stopped = "max_tables";
      break;
    }
    if (Date.now() >= deps.deadline) {
      stopped = "deadline";
      break;
    }
    if (table.client_status && table.client_status !== "active") {
      cursor = table.id;
      considered += 1;
      continue;
    }
    const platform = platformFor(table.integration_type);
    if (
      platform &&
      !rateLimited.has(platform) &&
      budget.remaining < MIN_CALLS[platform] &&
      processed.length > 0
    ) {
      stopped = "budget";
      break;
    }

    const startedAt = deps.now();
    let result: TableReconcileResult;
    if (platform && rateLimited.has(platform)) {
      // The platform already refused this call; asking again only burns quota.
      result = skippedResult(table, "platform_rate_limited");
    } else {
      try {
        result = await reconcileTable({
          table,
          source: deps.sourceFor(table),
          readAios: store.readAios,
          now: startedAt,
          tolerance: RECONCILE_TOLERANCE,
          maxFindings: MAX_FINDINGS_PER_TABLE,
        });
      } catch (err) {
        const isBudget =
          err instanceof ReconcileSourceError && err.kind === "budget";
        if (isBudget && processed.length > 0) {
          // Retry this table on the next call with a fresh budget.
          stopped = "budget";
          break;
        }
        result = {
          status: "failed",
          platform,
          window_start: null,
          window_end: null,
          findings: [],
          error_kind: isBudget ? "budget" : "platform",
          summary: {
            platform,
            error_kind: isBudget ? "budget" : "internal",
            error: redactSecrets(err instanceof Error ? err.message : err),
          },
        };
      }
    }
    if (result.error_kind === "rate_limit" && platform)
      rateLimited.add(platform);

    const entry: ProcessedTable = {
      table_id: table.id,
      status: result.status,
      findings: result.findings.length,
      error_kind: result.error_kind,
    };

    if (result.status === "mismatch") {
      const previous = await store.latestRun(table.id).catch(() => null);
      const persisting = previous?.status === "mismatch";
      if (persisting) result.summary.persisting = true;
      const wantsResync =
        table.integration_settings?.reconcile_autoresync === true &&
        !!deps.triggerResync &&
        result.window_start &&
        result.window_end;
      if (wantsResync && !persisting) {
        if (insideRefreshWindow(startedAt)) {
          result.summary.resync = { skipped: "refresh_window" };
        } else {
          const window = {
            start: result.window_start as string,
            end: result.window_end as string,
          };
          const r = await deps.triggerResync!(table, window).catch((err) => ({
            ok: false,
            error: redactSecrets(err instanceof Error ? err.message : err),
          }));
          result.summary.resync = {
            requested_at: deps.now().toISOString(),
            window,
            ok: r.ok,
            ...("status" in r && r.status ? { status: r.status } : {}),
            ...("error" in r && r.error ? { error: r.error } : {}),
          };
        }
        entry.resync = result.summary.resync as Record<string, unknown>;
      }
    }

    try {
      entry.run_id = await store.saveRun(
        runRecord(table, result, startedAt, deps.now()),
        result.findings,
      );
    } catch (err) {
      entry.save_error = redactSecrets(
        err instanceof Error ? err.message : err,
      );
      log(`[reconcile] save failed for ${table.id}: ${entry.save_error}`);
    }
    processed.push(entry);
    cursor = table.id;
    considered += 1;
  }

  const exhausted = !stopped && tables.length < fetchLimit;
  if (!stopped && !exhausted && considered === tables.length)
    stopped = "max_tables";
  return {
    processed,
    next_cursor: exhausted ? null : cursor,
    done: exhausted,
    stopped,
    api_calls: budget.used,
  };
}

// ── Unmapped Meta accounts ─────────────────────────────────────────────────

export type MetaAccountWithSpend = {
  account_id: string;
  name: string | null;
  currency: string | null;
  spend_7d: number;
};

/**
 * Meta ad accounts with spend over the last 7 complete days that are not mapped
 * to any report table or client. One run per connection's tenant.
 */
export async function runUnmappedAccountsCheck(deps: {
  connections: Array<{ id: string; tenant_id: string; token: string }>;
  mapped: Set<string>;
  listAccounts: (token: string) => Promise<MetaAccountWithSpend[]>;
  saveRun: (run: StoredRun, findings: ReconcileFinding[]) => Promise<string>;
  budget: CallBudget;
  now: () => Date;
  deadline: number;
  minSpend?: number;
}): Promise<{ next_cursor: string | null; done: boolean; tenants: number }> {
  const minSpend = deps.minSpend ?? RECONCILE_TOLERANCE.money;
  const byTenant = new Map<
    string,
    {
      findings: ReconcileFinding[];
      errors: string[];
      accounts: number;
      startedAt: Date;
    }
  >();
  const reported = new Set<string>();
  let cursor: string | null = null;
  let done = true;
  for (const conn of deps.connections) {
    if (Date.now() >= deps.deadline || deps.budget.remaining < 1) {
      done = false;
      break;
    }
    const bucket = byTenant.get(conn.tenant_id) || {
      findings: [],
      errors: [],
      accounts: 0,
      startedAt: deps.now(),
    };
    byTenant.set(conn.tenant_id, bucket);
    try {
      const accounts = await deps.listAccounts(conn.token);
      bucket.accounts += accounts.length;
      for (const acct of accounts) {
        if (deps.mapped.has(acct.account_id)) continue;
        if (acct.spend_7d <= minSpend) continue;
        const key = `${conn.tenant_id}:${acct.account_id}`;
        if (reported.has(key)) continue;
        reported.add(key);
        bucket.findings.push({
          kind: "unmapped_account",
          campaign_id: null,
          date: null,
          metric: "spend",
          aios_value: 0,
          platform_value: Math.round(acct.spend_7d * 100) / 100,
          details: {
            account_id: acct.account_id,
            account_name: acct.name,
            currency: acct.currency,
            connection_id: conn.id,
          },
        });
      }
    } catch (err) {
      if (err instanceof ReconcileSourceError && err.kind === "budget") {
        done = false;
        break;
      }
      bucket.errors.push(
        redactSecrets(err instanceof Error ? err.message : err),
      );
    }
    cursor = conn.id;
  }

  for (const [tenantId, bucket] of byTenant) {
    const status: RunStatus = bucket.findings.length
      ? "mismatch"
      : bucket.errors.length && !bucket.accounts
        ? "failed"
        : "ok";
    const findings = bucket.findings
      .sort((a, b) => (b.platform_value ?? 0) - (a.platform_value ?? 0))
      .slice(0, MAX_FINDINGS_PER_TABLE);
    await deps.saveRun(
      {
        tenant_id: tenantId,
        table_id: null,
        client_id: null,
        platform: "meta",
        started_at: bucket.startedAt.toISOString(),
        finished_at: deps.now().toISOString(),
        status,
        window_start: null,
        window_end: null,
        summary: {
          check: "unmapped_accounts",
          accounts_seen: bucket.accounts,
          counts: { unmapped_account: bucket.findings.length },
          findings_total: bucket.findings.length,
          errors: bucket.errors.length ? bucket.errors.slice(0, 3) : undefined,
          top_findings: findings.slice(0, 5).map((f) => ({
            kind: f.kind,
            campaign: f.details.account_name || f.details.account_id,
            date: null,
            metric: f.metric,
            aios: 0,
            platform: f.platform_value,
          })),
        },
      },
      findings,
    );
  }
  return {
    next_cursor: done ? null : cursor,
    done,
    tenants: byTenant.size,
  };
}
