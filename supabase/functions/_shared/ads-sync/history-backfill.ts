/**
 * One-off history backfill for the scheduled ads syncs (Meta insights, Google
 * Ads).
 *
 * The scheduled catch-up only reaches today-120 days (planScheduledSyncWindows),
 * so older days lost from crm_records are never fetched again. A migration may
 * pin `integration_settings.history_backfill = {"start": "yyyy-MM-dd", "end":
 * "yyyy-MM-dd"}` on a report table: the next scheduled run fetches that window
 * through the same bounded write as a catch-up slice (only its days are
 * replaced) and clears the marker after a clean write. Any other outcome keeps
 * it, so the following run retries.
 */
import type { SyncWindow } from "../report-sync-window.ts";
import { isRecord } from "./is-record.ts";
import type { SyncOutcomeStatus } from "./outcome.ts";
import { parseRequestedWindow } from "./requested-window.ts";

/** The integration_settings key that holds the marker. */
export const HISTORY_BACKFILL_KEY = "history_backfill";

/**
 * The window this scheduled run backfills, or null.
 *
 * Runs only when the plan has no catch-up slice: the backfill takes the
 * catch-up's place, so one run never fetches more than one past window and
 * stays within the 150 s edge limit. The marker must name real dates, end by
 * today (Israel) and span at most MAX_REQUESTED_WINDOW_DAYS, what one run can
 * fetch; any other marker is logged and ignored.
 */
export function planHistoryBackfill(
  settings: unknown,
  plan: { catchup: SyncWindow | null; today: string },
): SyncWindow | null {
  if (plan.catchup) {
    return null;
  }
  const marker = isRecord(settings) ? settings[HISTORY_BACKFILL_KEY] : null;
  if (!isRecord(marker)) {
    return null;
  }

  const parsed = parseRequestedWindow(
    { start_date: marker.start, end_date: marker.end },
    { today: plan.today, enforceLimits: true },
  );
  if (parsed.kind === "invalid") {
    console.warn(`[history-backfill] marker ignored: ${parsed.error}`);
  }
  return parsed.kind === "window" ? parsed.window : null;
}

/**
 * The settings patch after the backfill write. Only `ok` clears the marker: an
 * empty fetch with no stored rows for those days is `ok` too
 * (confirmEmptyPlan), so a table without delivery then is done. `partial`
 * restored the campaign rows but not a failed ad set or ad level, `failed`
 * wrote nothing and `empty` (the platform returned nothing although rows are
 * stored) left the days as they were: each keeps the marker for the next run.
 * The marker is set to null because the settings save merges keys and cannot
 * remove one.
 */
export function historyBackfillPatch(
  status: SyncOutcomeStatus,
): Record<string, null> {
  return status === "ok" ? { [HISTORY_BACKFILL_KEY]: null } : {};
}

/**
 * historyBackfillPatch for a sync-google-ads-data run: only a run flagged
 * `history_backfill: true` by a trusted caller (the internal cron with the
 * service role) may clear the marker.
 */
export function requestedHistoryBackfillPatch(
  status: SyncOutcomeStatus,
  request: { historyBackfill: unknown; trusted: boolean },
): Record<string, null> {
  return request.historyBackfill === true && request.trusted
    ? historyBackfillPatch(status)
    : {};
}
