/**
 * Optional auto-resync after a mismatch (AIO-238): off by default
 * (crm_tables.integration_settings.reconcile_autoresync), and only for the
 * report types whose sync honors a window. It asks the table's own sync
 * function to re-fetch the compared days once, clear of the refresh windows.
 */
import type {} from "../_shared/edge-runtime.d.ts";
import { redactedMessage } from "../_shared/reconcile/errors.ts";
import type {
  ResyncSummary,
  TableReconcileResult,
} from "../_shared/reconcile/run-summary.ts";
import type { ReconcileTable } from "../_shared/reconcile/types.ts";
import { jerusalemToday } from "../_shared/report-sync-window.ts";
import { resyncAllowedAt } from "./refresh-windows.ts";
import type { LatestRun } from "./store.ts";

/**
 * The sync function each resyncable report type re-fetches with: these honor
 * start_date/end_date and update_last_sync=false. sync-facebook-insights
 * ignores both (it re-syncs 120+ days at every level and moves last_sync_at),
 * so facebook_insights tables are never auto-resynced.
 */
export const RESYNC_SYNC_FUNCTION: Record<string, string> = {
  google_ads: "sync-google-ads-data",
  facebook_ecommerce: "sync-facebook-ecommerce",
};

/** Queues the table's own sync for the window; `queued` says nothing about its outcome. */
export type ResyncTrigger = (
  table: ReconcileTable,
  window: { start: string; end: string },
) => Promise<{ queued: boolean; error?: string }>;

/**
 * After a mismatch: flags it persisting when the table's previous run was a
 * mismatch too, and, when the table opts in, asks once for a resync of a new
 * mismatch. Writes both into the result's summary and returns the resync
 * outcome when a resync was considered.
 */
export async function followUpMismatch(
  table: ReconcileTable,
  result: TableReconcileResult,
  deps: {
    latestRun: (tableId: string) => Promise<LatestRun | null>;
    triggerResync?: ResyncTrigger;
    now: () => Date;
    log: (message: string) => void;
  },
  startedAt: Date,
): Promise<ResyncSummary | undefined> {
  const previous = await deps.latestRun(table.id).catch((err) => {
    deps.log(
      `[reconcile] latest run read failed for ${table.id}: ${redactedMessage(err)}`,
    );
    result.summary.persisting_unknown = true;
    return null;
  });
  const persisting = previous?.status === "mismatch";
  if (persisting) {
    result.summary.persisting = true;
  }
  const trigger = deps.triggerResync;
  const optedIn = table.integration_settings?.reconcile_autoresync === true;
  if (!optedIn || !trigger || persisting) {
    return undefined;
  }
  if (!result.window_start || !result.window_end) {
    return undefined;
  }
  const compared = { start: result.window_start, end: result.window_end };
  result.summary.resync = await requestResync(
    table,
    compared,
    trigger,
    deps.now,
    startedAt,
  );
  return result.summary.resync;
}

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

/** A trigger that POSTs to the table's sync function and keeps the isolate alive for it. */
export function createResyncTrigger(
  supabaseUrl: string,
  serviceKey: string,
): ResyncTrigger {
  return async (table, window) => {
    const fn = RESYNC_SYNC_FUNCTION[table.integration_type];
    if (!fn) {
      return { queued: false, error: "no sync function" };
    }
    const task = fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        "x-internal-cron": "true",
      },
      body: JSON.stringify({
        table_id: table.id,
        start_date: window.start,
        end_date: window.end,
        update_last_sync: false,
        _internal_cron: true,
      }),
    })
      .then((res) => {
        console.log(`[reconcile] resync ${fn} ${table.id}: ${res.status}`);
      })
      .catch((err) =>
        console.error(`[reconcile] resync ${fn} ${table.id} failed:`, err),
      );
    // The sync can outlive this call; keep the isolate alive for it.
    if (typeof EdgeRuntime !== "undefined") {
      EdgeRuntime.waitUntil(task);
    }
    // Fire-and-forget: only the request is known, not the sync's outcome.
    return { queued: true };
  };
}

/** Asks for the resync, or says why it was skipped. */
async function requestResync(
  table: ReconcileTable,
  compared: { start: string; end: string },
  trigger: ResyncTrigger,
  now: () => Date,
  startedAt: Date,
): Promise<ResyncSummary> {
  if (!Object.hasOwn(RESYNC_SYNC_FUNCTION, table.integration_type)) {
    return { skipped: "sync_ignores_window" };
  }
  if (!resyncAllowedAt(startedAt)) {
    return { skipped: "refresh_window" };
  }
  const window = resyncWindow(compared, startedAt);
  const r = await trigger(table, window).catch((err) => ({
    queued: false,
    error: redactedMessage(err),
  }));
  return {
    requested_at: now().toISOString(),
    window,
    queued: r.queued,
    ...(r.error ? { error: r.error } : {}),
  };
}
