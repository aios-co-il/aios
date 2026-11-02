/**
 * What a multi-level ads fetch may replace (planLevelWrite), and how the run ends
 * once its write finished (finalizeSyncOutcome).
 */
import { ADS_LEVELS, type AdsEntityLevel } from "./levels.ts";
import {
  buildSyncOutcome,
  type SyncOutcome,
  type SyncOutcomeStatus,
} from "./outcome.ts";

export type LevelWritePlan = {
  /** False: leave every stored row alone (nothing usable came back). */
  write: boolean;
  /** Final status when `write` is false; the status to record after a clean write otherwise. */
  status: SyncOutcomeStatus;
  /** Levels whose stored rows this run may replace. */
  levelsOk: AdsEntityLevel[];
  /** Rows fetched across the usable levels. */
  rows: number;
  error?: string;
};

/**
 * Decide what a multi-level ads fetch is allowed to replace.
 *
 * - The campaign level feeds the pulse and every report total. If it failed, or came
 *   back empty while lower levels did not, the run aborts: replacing the window
 *   would leave those days without campaign rows (zero spend in the pulse).
 * - Nothing fetched: stored rows stay and the run is `empty`. confirmEmptyPlan
 *   (write-window.ts) turns it into a clean `ok` when nothing is stored for
 *   those days either, i.e. there was simply no delivery.
 * - A failed ad set or ad level only skips that level: its stored rows are kept and
 *   the run is `partial`.
 */
export function planLevelWrite(input: {
  levelCounts: Partial<Record<AdsEntityLevel, number>>;
  levelErrors?: Partial<Record<AdsEntityLevel, string | null | undefined>>;
  levels?: readonly AdsEntityLevel[];
}): LevelWritePlan {
  const levels: readonly AdsEntityLevel[] = input.levels || ADS_LEVELS;
  const errors = input.levelErrors || {};
  const failed = levels.filter((level) => !!errors[level]);
  const levelsOk = levels.filter((level) => !errors[level]);
  const count = (level: AdsEntityLevel) =>
    Math.max(0, input.levelCounts[level] || 0);
  const rows = levelsOk.reduce((total, level) => total + count(level), 0);
  const errorText = failed
    .map((level) => `${level}: ${errors[level]}`)
    .join("; ");

  if (errors.campaign) {
    return {
      write: false,
      status: "failed",
      levelsOk,
      rows: 0,
      error: `campaign level fetch failed — stored rows kept (${errorText})`,
    };
  }
  if (rows === 0) {
    // A campaign level fetched cleanly with no rows already proves there was no
    // delivery, so a failed lower level changes nothing: empty, not failed.
    return failed.length && !levels.includes("campaign")
      ? { write: false, status: "failed", levelsOk, rows: 0, error: errorText }
      : { write: false, status: "empty", levelsOk, rows: 0 };
  }
  if (levels.includes("campaign") && count("campaign") === 0) {
    return {
      write: false,
      status: "failed",
      levelsOk,
      rows: 0,
      error:
        "campaign level returned no rows while lower levels did — stored rows kept",
    };
  }
  return failed.length
    ? { write: true, status: "partial", levelsOk, rows, error: errorText }
    : { write: true, status: "ok", levelsOk, rows };
}

/** Final outcome of a run once its write (if any) finished. */
export function finalizeSyncOutcome(
  plan: LevelWritePlan,
  write: { inserted: number; error?: string | null } | null,
  meta: { at?: string; source?: string } = {},
): SyncOutcome {
  if (!plan.write || !write) {
    return buildSyncOutcome({
      status: plan.status,
      rows: 0,
      levelsOk: plan.levelsOk,
      error: plan.error,
      ...meta,
    });
  }
  if (write.error) {
    return buildSyncOutcome({
      status: "failed",
      rows: write.inserted,
      levelsOk: plan.levelsOk,
      error: write.error,
      ...meta,
    });
  }
  return buildSyncOutcome({
    status: plan.status,
    rows: write.inserted,
    levelsOk: plan.levelsOk,
    error: plan.error,
    ...meta,
  });
}
