import type {
  SyncOutcome,
  SyncOutcomeStatus,
} from "../_shared/ads-sync/outcome.ts";
import type { SyncWindow } from "../_shared/report-sync-window.ts";
import {
  historyBackfillPatch,
  planHistoryBackfill,
} from "../_shared/ads-sync/history-backfill.ts";

/** Runs the catch-up window: its error text when it failed or threw, null otherwise. */
export async function runCatchup(
  writeWindow: (window: SyncWindow) => Promise<{ outcome: SyncOutcome }>,
  window: SyncWindow,
): Promise<string | null> {
  try {
    const { outcome } = await writeWindow(window);
    return outcome.status === "failed" ? outcome.error || "failed" : null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Runs the history backfill the settings pin (planHistoryBackfill), or null
 * when this run has none: its outcome status ("failed" when it threw), error
 * text and the settings patch for saveSyncRun. Never throws, so the refresh
 * still runs.
 */
export async function runHistoryBackfill(
  writeWindow: (window: SyncWindow) => Promise<{ outcome: SyncOutcome }>,
  settings: unknown,
  plan: { catchup: SyncWindow | null; today: string },
): Promise<{
  status: SyncOutcomeStatus;
  error: string | null;
  settingsPatch: Record<string, null>;
} | null> {
  const window = planHistoryBackfill(settings, plan);
  if (!window) {
    return null;
  }
  let status: SyncOutcomeStatus;
  let error: string | null;
  try {
    const { outcome } = await writeWindow(window);
    status = outcome.status;
    error = outcome.error || null;
  } catch (thrown) {
    status = "failed";
    error = thrown instanceof Error ? thrown.message : String(thrown);
  }
  return { status, error, settingsPatch: historyBackfillPatch(status) };
}
