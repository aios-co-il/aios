/**
 * Reconcile one report table (facebook_insights, facebook_ecommerce or
 * google_ads) against its ad platform (AIO-238). Pure apart from the injected
 * platform source and AIOS reader, so the worker, Carmen's tools and the tests
 * share one implementation.
 */
import { compareCampaignDays } from "./compare.ts";
import { isBudgetError, redactedMessage } from "./errors.ts";
import type { ReconcileTolerance } from "./metrics.ts";
import { platformFor, type ReconcilePlatform } from "./run-status.ts";
import type { RunSummary, TableReconcileResult } from "./run-summary.ts";
import {
  errorResult,
  skippedResult,
  sourceErrorKind,
} from "./skipped-or-failed.ts";
import type {
  AccountInfo,
  AiosReader,
  CampaignDayRow,
  PlatformSource,
  ReconcileTable,
} from "./types.ts";
import { completeDaysWindow, pendingDates, tableLastSyncAt } from "./window.ts";

/** Findings kept per table per run; the summary still counts every one. */
export const MAX_FINDINGS_PER_TABLE = 100;

/**
 * Reconcile one table. Platform failures never throw (except an exhausted call
 * budget, which the caller handles by retrying the table later): they return a
 * failed result with a redacted error and no findings, so a bad token cannot
 * flood the findings table.
 */
export async function reconcileTable(input: {
  table: ReconcileTable;
  source: PlatformSource;
  readAios: AiosReader;
  now: Date;
  days?: number;
  tolerance?: ReconcileTolerance;
  maxFindings?: number;
  keepRows?: boolean;
}): Promise<TableReconcileResult> {
  const { table, source } = input;
  const platform = platformFor(table.integration_type);
  const base: RunSummary = {
    platform,
    source: source.name,
    integration_type: table.integration_type,
  };
  if (!platform) {
    return skippedResult(platform, base, "unsupported_integration");
  }
  const loaded = await loadAccount(table, source, platform, base);
  if ("result" in loaded) {
    return loaded.result;
  }
  const { account } = loaded;

  const window = completeDaysWindow(input.now, account.timezone, input.days);
  const pending = pendingDates(window, tableLastSyncAt(table));
  const compared = window.dates.filter((d) => !pending.includes(d));
  const summary: RunSummary = {
    ...base,
    account_id: account.account_id,
    account_name: account.name || null,
    timezone: window.timezone,
    timezone_fallback: window.timezone_fallback || undefined,
    currency: account.currency,
    pending_dates: pending,
    compared_dates: compared.length,
    requested_window: { start: window.start, end: window.end },
  };
  // Every day still waits for a sync (e.g. days=1 before the morning sync, or
  // a stalled sync): nothing can be compared, so this is not a match.
  if (!compared.length) {
    return skippedResult(platform, summary, "not_yet_synced");
  }

  let platformRows: CampaignDayRow[];
  try {
    const span = { start: window.start, end: window.end };
    platformRows = (await source.campaignDays(table, span, account)).rows;
  } catch (err) {
    if (isBudgetError(err)) {
      throw err;
    }
    return errorResult(platform, window, sourceErrorKind(err), err, summary);
  }

  let aiosRows: CampaignDayRow[];
  try {
    aiosRows = await input.readAios(table, window.start, window.end);
  } catch (err) {
    return errorResult(platform, window, "aios_read", err, summary);
  }

  const cmp = compareCampaignDays({
    table,
    platform,
    aiosRows,
    platformRows,
    dates: compared,
    tolerance: input.tolerance,
  });
  const findings = cmp.findings.slice(
    0,
    input.maxFindings ?? MAX_FINDINGS_PER_TABLE,
  );
  return {
    status: cmp.findings.length ? "mismatch" : "ok",
    platform,
    // The run's window is the days actually compared, so "checked 19.10–24.10"
    // never names a pending day that was held back.
    window_start: compared[0],
    window_end: compared[compared.length - 1],
    findings,
    summary: {
      ...summary,
      counts: cmp.counts,
      totals: cmp.totals,
      campaigns: cmp.campaigns,
      missing_dates: cmp.missing_dates,
      findings_total: cmp.findings.length,
      findings_stored: findings.length,
      truncated: cmp.findings.length > findings.length || undefined,
    },
    ...(input.keepRows
      ? { platform_rows: platformRows, aios_rows: aiosRows }
      : {}),
  };
}

/** The table's ad account, or the skipped/failed result when it cannot be read. */
async function loadAccount(
  table: ReconcileTable,
  source: PlatformSource,
  platform: ReconcilePlatform,
  base: RunSummary,
): Promise<{ account: AccountInfo } | { result: TableReconcileResult }> {
  try {
    return { account: await source.account(table) };
  } catch (err) {
    if (isBudgetError(err)) {
      throw err;
    }
    const kind = sourceErrorKind(err);
    if (kind === "config") {
      return { result: skippedResult(platform, base, redactedMessage(err)) };
    }
    return { result: errorResult(platform, null, kind, err, base) };
  }
}
