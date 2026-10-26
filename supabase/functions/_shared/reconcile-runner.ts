/**
 * Chunked driver for the nightly reconciliation (AIO-238). One worker call
 * reconciles report tables in id order after `cursor` until it hits its table
 * count, API-call budget or wall-clock deadline, then hands back the cursor for
 * the next call. After the last table it can list Meta ad accounts with spend
 * that no client is mapped to.
 *
 * Report-only: it stores runs and findings and never sends anything. The
 * optional auto-resync (crm_tables.integration_settings.reconcile_autoresync,
 * off by default; Google Ads and Meta ecommerce tables only) asks the table's
 * own sync function to re-fetch the window once, well clear of the
 * morning/afternoon refresh windows.
 */
import { jerusalemToday } from "./report-sync-window.ts";
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

/**
 * A resync must also finish before the next refresh window, or it races the
 * scheduled sync's delete + insert on the same table.
 */
export const RESYNC_LEAD_MS = 30 * 60_000;

export function resyncAllowedAt(now: Date): boolean {
  return (
    !insideRefreshWindow(now) &&
    !insideRefreshWindow(new Date(now.getTime() + RESYNC_LEAD_MS))
  );
}

/**
 * Syncs that honor a start_date/end_date window and update_last_sync=false.
 * sync-facebook-insights ignores both (it re-syncs 120+ days at every level and
 * moves last_sync_at), so those tables are never auto-resynced.
 */
export const RESYNC_INTEGRATION_TYPES = ["google_ads", "facebook_ecommerce"];

/**
 * The window a resync asks for. The syncs delete every stored row from the
 * start date onwards before inserting what they fetched, so the window must run
 * through today (the scheduled syncs end on Jerusalem's today) or today's rows
 * would disappear until the next scheduled sync.
 */
export function resyncWindow(
  compared: { start: string; end: string },
  now: Date,
): { start: string; end: string } {
  const today = jerusalemToday(now);
  return {
    start: compared.start,
    end: today > compared.end ? today : compared.end,
  };
}

/** Calls one table needs at minimum: Meta = account + campaigns + adsets + insights. */
const MIN_CALLS: Record<ReconcilePlatform, number> = { meta: 4, google: 3 };

/** Queues the table's own sync for the window; `queued` says nothing about its outcome. */
export type ResyncTrigger = (
  table: ReconcileTable,
  window: { start: string; end: string },
) => Promise<{ queued: boolean; error?: string }>;

export type ProcessedTable = {
  table_id: string;
  status: RunStatus;
  findings: number;
  error_kind?: string;
  /** Set when the table was passed over and its previous result kept. */
  skipped_reason?: string;
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
      // No run is stored, so the table keeps its previous result (and trust
      // line) instead of a "skipped" row that hides it.
      processed.push({
        table_id: table.id,
        status: "skipped",
        findings: 0,
        skipped_reason: "platform_rate_limited",
      });
      cursor = table.id;
      considered += 1;
      continue;
    }
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
    // A per-ad-account throttle fails only this table.
    if (
      result.error_kind === "rate_limit" &&
      result.rate_limit_scope !== "account" &&
      platform
    )
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
        if (!RESYNC_INTEGRATION_TYPES.includes(table.integration_type)) {
          result.summary.resync = { skipped: "sync_ignores_window" };
        } else if (!resyncAllowedAt(startedAt)) {
          result.summary.resync = { skipped: "refresh_window" };
        } else {
          const window = resyncWindow(
            {
              start: result.window_start as string,
              end: result.window_end as string,
            },
            startedAt,
          );
          const r = await deps.triggerResync!(table, window).catch((err) => ({
            queued: false,
            error: redactSecrets(err instanceof Error ? err.message : err),
          }));
          result.summary.resync = {
            requested_at: deps.now().toISOString(),
            window,
            queued: r.queued,
            ...(r.error ? { error: r.error } : {}),
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

export type TenantConnections = {
  tenant_id: string;
  connections: Array<{ id: string; token: string }>;
};

/**
 * Meta ad accounts with spend over the last 7 complete days that are not mapped
 * to any report table or client: one run per tenant, covering every one of the
 * tenant's connections.
 *
 * Tenants are walked one at a time after `cursor` (the last tenant fully
 * checked). When the call runs out of budget or time inside a tenant, nothing
 * is saved for it and the next call starts that tenant again, so a run never
 * reports "ok" from half of a tenant's connections. Only a tenant too big for a
 * whole call on its own is saved partial (flagged incomplete) so the walk moves on.
 */
export async function runUnmappedAccountsCheck(deps: {
  cursor: string | null;
  nextTenant: (
    afterTenantId: string | null,
  ) => Promise<TenantConnections | null>;
  mapped: Set<string>;
  listAccounts: (token: string) => Promise<MetaAccountWithSpend[]>;
  saveRun: (run: StoredRun, findings: ReconcileFinding[]) => Promise<string>;
  budget: CallBudget;
  now: () => Date;
  deadline: number;
  minSpend?: number;
}): Promise<{ next_cursor: string | null; done: boolean; tenants: number }> {
  const minSpend = deps.minSpend ?? RECONCILE_TOLERANCE.money;
  const outOfRoom = () =>
    Date.now() >= deps.deadline || deps.budget.remaining < 1;
  let cursor = deps.cursor;
  let tenants = 0;

  for (;;) {
    if (outOfRoom()) return { next_cursor: cursor, done: false, tenants };
    const group = await deps.nextTenant(cursor);
    if (!group) return { next_cursor: null, done: true, tenants };

    const startedAt = deps.now();
    const findings: ReconcileFinding[] = [];
    const errors: string[] = [];
    const reported = new Set<string>();
    let accountsSeen = 0;
    let complete = true;
    for (const conn of group.connections) {
      if (outOfRoom()) {
        complete = false;
        break;
      }
      try {
        const accounts = await deps.listAccounts(conn.token);
        accountsSeen += accounts.length;
        for (const acct of accounts) {
          if (deps.mapped.has(acct.account_id)) continue;
          if (acct.spend_7d <= minSpend) continue;
          if (reported.has(acct.account_id)) continue;
          reported.add(acct.account_id);
          findings.push({
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
          complete = false;
          break;
        }
        errors.push(redactSecrets(err instanceof Error ? err.message : err));
      }
    }

    // Retry the tenant from scratch on the next call rather than store half of it.
    if (!complete && tenants > 0)
      return { next_cursor: cursor, done: false, tenants };

    const status: RunStatus = findings.length
      ? "mismatch"
      : !complete
        ? "skipped"
        : errors.length && !accountsSeen
          ? "failed"
          : "ok";
    const kept = findings
      .sort((a, b) => (b.platform_value ?? 0) - (a.platform_value ?? 0))
      .slice(0, MAX_FINDINGS_PER_TABLE);
    await deps.saveRun(
      {
        tenant_id: group.tenant_id,
        table_id: null,
        client_id: null,
        platform: "meta",
        started_at: startedAt.toISOString(),
        finished_at: deps.now().toISOString(),
        status,
        window_start: null,
        window_end: null,
        summary: {
          check: "unmapped_accounts",
          connections: group.connections.length,
          accounts_seen: accountsSeen,
          counts: { unmapped_account: findings.length },
          findings_total: findings.length,
          incomplete: complete ? undefined : true,
          skipped_reason: status === "skipped" ? "incomplete" : undefined,
          errors: errors.length ? errors.slice(0, 3) : undefined,
          top_findings: kept.slice(0, 5).map((f) => ({
            kind: f.kind,
            campaign: f.details.account_name || f.details.account_id,
            date: null,
            metric: f.metric,
            aios: 0,
            platform: f.platform_value,
          })),
        },
      },
      kept,
    );
    tenants += 1;
    cursor = group.tenant_id;
    if (!complete) return { next_cursor: cursor, done: false, tenants };
  }
}
