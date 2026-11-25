/**
 * One-off history backfill for the scheduled ads syncs (Meta insights, Google
 * Ads).
 *
 * The scheduled catch-up only reaches today-120 days (planScheduledSyncWindows),
 * so older days lost from crm_records are never fetched again. A migration may
 * pin `integration_settings.history_backfill = {"start": "yyyy-MM-dd", "end":
 * "yyyy-MM-dd"}` on a report table: the next scheduled run fetches that window
 * through the same bounded write as a catch-up slice (only its days are
 * replaced) and clears the marker after the write. A failed write keeps it, so
 * the following run retries.
 */
import type { SyncWindow } from "../report-sync-window.ts";
import { isRecord } from "./is-record.ts";
import { isWriteSuccess, type SyncOutcomeStatus } from "./outcome.ts";
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
 * The settings patch after the backfill write. A write (`ok`/`partial`) clears
 * the marker; an empty fetch with no stored rows for those days is `ok` too
 * (confirmEmptyPlan), so a table without delivery then is done. `failed` and
 * `empty` (the platform returned nothing although rows are stored) keep it for
 * the next run. The marker is set to null because the settings save merges
 * keys and cannot remove one.
 */
export function historyBackfillPatch(
  status: SyncOutcomeStatus,
): Record<string, null> {
  return isWriteSuccess(status) ? { [HISTORY_BACKFILL_KEY]: null } : {};
}
