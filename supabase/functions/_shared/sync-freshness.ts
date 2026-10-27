/**
 * Reader side of truthful sync freshness (see sync-outcome.ts): did the latest
 * sync run of a crm_tables row refresh its data? Shared by the pulse snapshot,
 * the health probe, the pulse dashboard and the report pages.
 */
import type {
  SyncOutcome,
  SyncOutcomeStatus,
  SyncProblem,
} from "./sync-outcome.ts";

export type { SyncProblem };

const STATUSES = new Set<SyncOutcomeStatus>([
  "ok",
  "empty",
  "partial",
  "failed",
]);

export type SyncTableLike = {
  last_sync_at?: string | null;
  last_sync_outcome?: unknown;
  /** Settings object (or null); typed loosely so any table row fits. */
  integration_settings?: unknown;
};

function settingsOf(table: SyncTableLike): Record<string, unknown> {
  const settings = table.integration_settings;
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

function timeOf(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function asOutcome(value: unknown): SyncOutcome | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<SyncOutcome>;
  if (!candidate.status || !STATUSES.has(candidate.status)) return null;
  if (timeOf(candidate.at) === null) return null;
  return candidate as SyncOutcome;
}

/** Latest recorded outcome: the newer of the column and the settings mirror. */
export function resolveSyncOutcome(table: SyncTableLike): SyncOutcome | null {
  const candidates = [
    asOutcome(table.last_sync_outcome),
    asOutcome(settingsOf(table).last_sync_outcome),
  ].filter((outcome): outcome is SyncOutcome => !!outcome);
  if (!candidates.length) return null;
  return candidates.sort(
    (a, b) => (timeOf(b.at) as number) - (timeOf(a.at) as number),
  )[0];
}

/** Newest successful write (column or settings `last_sync_at`), epoch ms. */
function lastWriteMs(table: SyncTableLike): number | null {
  const times = [table.last_sync_at, settingsOf(table).last_sync_at]
    .map(timeOf)
    .filter((ms): ms is number => ms !== null);
  return times.length ? Math.max(...times) : null;
}

/**
 * `empty` or `failed` when the latest run did not refresh the stored data, null
 * otherwise. An outcome older than the last successful write (a writer that does
 * not record outcomes ran since) is ignored.
 */
export function syncOutcomeProblem(table: SyncTableLike): SyncProblem | null {
  const outcome = resolveSyncOutcome(table);
  if (!outcome || (outcome.status !== "empty" && outcome.status !== "failed"))
    return null;
  const lastWrite = lastWriteMs(table);
  if (lastWrite !== null && lastWrite > (timeOf(outcome.at) as number))
    return null;
  return outcome.status;
}

/** The worse of two problems (failed beats empty). */
export function worstSyncProblem(
  problems: Iterable<SyncProblem | null | undefined>,
): SyncProblem | null {
  let worst: SyncProblem | null = null;
  for (const problem of problems) {
    if (problem === "failed") return "failed";
    if (problem === "empty") worst = "empty";
  }
  return worst;
}
