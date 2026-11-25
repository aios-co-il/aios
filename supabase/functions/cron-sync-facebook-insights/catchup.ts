import type {
  SyncOutcome,
  SyncOutcomeStatus,
} from "../_shared/ads-sync/outcome.ts";
import type { SyncWindow } from "../_shared/report-sync-window.ts";

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
 * Runs the history backfill window: its outcome status ("failed" when it
 * threw) and error text. Never throws, so the refresh still runs.
 */
export async function runHistoryBackfill(
  writeWindow: (window: SyncWindow) => Promise<{ outcome: SyncOutcome }>,
  window: SyncWindow,
): Promise<{ status: SyncOutcomeStatus; error: string | null }> {
  try {
    const { outcome } = await writeWindow(window);
    return { status: outcome.status, error: outcome.error || null };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
