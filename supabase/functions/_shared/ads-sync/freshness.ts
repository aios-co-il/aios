/**
 * Reader side of truthful sync freshness (see outcome.ts): did the latest sync
 * run of a crm_tables row refresh its data? Shared by the pulse snapshot, the
 * health probe, the pulse dashboard and the report pages.
 */
import { isRecord } from "./is-record.ts";
import {
  isSyncOutcomeStatus,
  type SyncOutcome,
  type SyncOutcomeStatus,
} from "./outcome.ts";

/** Outcomes that mean the stored data was not refreshed by the latest run. */
export type SyncProblem = Extract<SyncOutcomeStatus, "empty" | "failed">;

export type SyncTableLike = {
  last_sync_at?: string | null;
  last_sync_outcome?: unknown;
  /** Settings object (or null); typed loosely so any table row fits. */
  integration_settings?: unknown;
};

type TimedOutcome = { outcome: SyncOutcome; atMs: number };

/**
 * `empty` or `failed` when the latest run did not refresh the stored data, null
 * otherwise. An outcome older than the last successful write (a writer that does
 * not record outcomes ran since) is ignored.
 */
export function syncOutcomeProblem(table: SyncTableLike): SyncProblem | null {
  const latest = latestOutcome(table);
  if (
    !latest ||
    (latest.outcome.status !== "empty" && latest.outcome.status !== "failed")
  ) {
    return null;
  }
  const lastWrite = lastWriteMs(table);
  if (lastWrite !== null && lastWrite > latest.atMs) {
    return null;
  }
  return latest.outcome.status;
}

/** Latest recorded outcome: the newer of the column and the settings mirror. */
export function resolveSyncOutcome(table: SyncTableLike): SyncOutcome | null {
  return latestOutcome(table)?.outcome ?? null;
}

/** The worst problem in `problems` (failed beats empty). */
export function worstSyncProblem(
  problems: Iterable<SyncProblem | null | undefined>,
): SyncProblem | null {
  let worst: SyncProblem | null = null;
  for (const problem of problems) {
    if (problem === "failed") {
      return "failed";
    }
    if (problem === "empty") {
      worst = "empty";
    }
  }
  return worst;
}

/** The newer valid outcome of the column and the settings mirror; the column wins a tie. */
function latestOutcome(table: SyncTableLike): TimedOutcome | null {
  const candidates = [
    table.last_sync_outcome,
    settingsOf(table).last_sync_outcome,
  ]
    .map(timedOutcome)
    .filter((candidate): candidate is TimedOutcome => candidate !== null);
  return candidates.sort((a, b) => b.atMs - a.atMs)[0] ?? null;
}

/** A stored outcome with its finish time in epoch ms, or null when it is not one. */
function timedOutcome(value: unknown): TimedOutcome | null {
  return isSyncOutcome(value)
    ? { outcome: value, atMs: Date.parse(value.at) }
    : null;
}

/** A known status and an `at` that parses: enough to rank and report the run. */
function isSyncOutcome(value: unknown): value is SyncOutcome {
  return (
    isRecord(value) &&
    isSyncOutcomeStatus(value.status) &&
    timeOf(value.at) !== null
  );
}

/** Newest successful write (column or settings `last_sync_at`), epoch ms. */
function lastWriteMs(table: SyncTableLike): number | null {
  const times = [table.last_sync_at, settingsOf(table).last_sync_at]
    .map(timeOf)
    .filter((ms): ms is number => ms !== null);
  return times.length ? Math.max(...times) : null;
}

/** The row's settings object; {} when it has none. */
function settingsOf(table: SyncTableLike): Record<string, unknown> {
  return isRecord(table.integration_settings) ? table.integration_settings : {};
}

/** Epoch ms of a non-blank date string; null when it does not parse. */
function timeOf(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
