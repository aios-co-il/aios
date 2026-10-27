/**
 * Truthful sync freshness for the ads report syncs (Meta insights, Meta ecommerce,
 * Google Ads, and the Make.com webhook).
 *
 * `last_sync_at` means "the last run that wrote data". Every run, successful or not,
 * also records `last_sync_attempt_at` and `last_sync_outcome`, so a run that came
 * back empty or failed no longer looks like a fresh sync. Both are stored on the
 * crm_tables columns and mirrored in `integration_settings`, the same way
 * `last_sync_at` is: readers that only load the settings still see them. The
 * mirror leaves out the (redacted) error text, which stays on the column.
 *
 * save-run.ts stores an outcome; freshness.ts reads it back.
 */
import type { AdsEntityLevel } from "./levels.ts";
import { redactSyncError } from "./redact.ts";

export const SYNC_OUTCOME_STATUSES = [
  "ok",
  "empty",
  "partial",
  "failed",
] as const;

export type SyncOutcomeStatus = (typeof SYNC_OUTCOME_STATUSES)[number];

export type SyncOutcome = {
  status: SyncOutcomeStatus;
  /** Rows written by this run. */
  rows: number;
  /** Report levels fetched without an error (ads syncs only). */
  levels_ok?: AdsEntityLevel[];
  error?: string;
  /** When the run finished (ISO). */
  at: string;
  /** Edge function that recorded the outcome. */
  source?: string;
};

const ERROR_MAX_CHARS = 300;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Normalised outcome; redacts the error before the 300-char cut. */
export function buildSyncOutcome(input: {
  status: SyncOutcomeStatus;
  rows?: number;
  levelsOk?: readonly AdsEntityLevel[];
  error?: string | null;
  at?: string;
  source?: string;
}): SyncOutcome {
  const outcome: SyncOutcome = {
    status: input.status,
    rows: Math.max(0, Math.round(input.rows || 0)),
    at: input.at || new Date().toISOString(),
  };
  if (input.levelsOk) {
    outcome.levels_ok = [...input.levelsOk];
  }
  // Redact before truncating: a cut could otherwise keep part of a token.
  if (input.error) {
    outcome.error = redactSyncError(input.error).slice(0, ERROR_MAX_CHARS);
  }
  if (input.source) {
    outcome.source = input.source;
  }
  return outcome;
}

/** ok/partial: the run wrote rows, so last_sync_at may move. */
export function isWriteSuccess(status: SyncOutcomeStatus): boolean {
  return status === "ok" || status === "partial";
}

/** One of SYNC_OUTCOME_STATUSES (stored outcomes are read back as plain JSON). */
export function isSyncOutcomeStatus(
  value: unknown,
): value is SyncOutcomeStatus {
  return SYNC_OUTCOME_STATUSES.some((status) => status === value);
}

/**
 * The outcome as mirrored in `integration_settings`, without `error`: the public
 * share-link endpoints return the settings verbatim. The error text stays on the
 * crm_tables.last_sync_outcome column only.
 */
export function settingsMirrorOutcome(outcome: SyncOutcome): SyncOutcome {
  const mirror: SyncOutcome = {
    status: outcome.status,
    rows: outcome.rows,
    at: outcome.at,
  };
  if (outcome.levels_ok) {
    mirror.levels_ok = [...outcome.levels_ok];
  }
  if (outcome.source) {
    mirror.source = outcome.source;
  }
  return mirror;
}

/**
 * Scheduled-run markers a run may store. A failed run keeps every marker so the
 * next run re-fetches the gap; an empty run still advances the history marker
 * (old days with no delivery are normal) but not `synced_through`/`lookback_on`,
 * so the days it found empty are fetched again.
 */
export function scheduledMarkerPatch(
  status: SyncOutcomeStatus,
  markers: {
    scheduled_history_from?: unknown;
    scheduled_synced_through?: unknown;
    scheduled_lookback_on?: unknown;
  },
): Record<string, string> {
  const patch: Record<string, string> = {};
  const valid = (value: unknown): value is string =>
    typeof value === "string" && ISO_DATE.test(value);
  if (status === "failed") {
    return patch;
  }
  if (valid(markers.scheduled_history_from)) {
    patch.scheduled_history_from = markers.scheduled_history_from;
  }
  if (status === "empty") {
    return patch;
  }
  if (valid(markers.scheduled_synced_through)) {
    patch.scheduled_synced_through = markers.scheduled_synced_through;
  }
  if (valid(markers.scheduled_lookback_on)) {
    patch.scheduled_lookback_on = markers.scheduled_lookback_on;
  }
  return patch;
}
