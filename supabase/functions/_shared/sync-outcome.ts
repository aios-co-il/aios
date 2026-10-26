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
 * Pure helpers only: the database writes live in ads-sync-write.ts and the
 * readers (is the latest run a problem?) in sync-freshness.ts.
 */

export type SyncOutcomeStatus = "ok" | "empty" | "partial" | "failed";
export type AdsLevel = "campaign" | "adset" | "ad";

export const ADS_LEVELS: readonly AdsLevel[] = ["campaign", "adset", "ad"];

export type SyncOutcome = {
  status: SyncOutcomeStatus;
  /** Rows written by this run. */
  rows: number;
  /** Report levels fetched without an error (ads syncs only). */
  levels_ok?: AdsLevel[];
  error?: string;
  /** When the run finished (ISO). */
  at: string;
  /** Edge function that recorded the outcome. */
  source?: string;
};

/** Outcomes that mean the stored data was not refreshed by the latest run. */
export type SyncProblem = "empty" | "failed";

const ERROR_MAX_CHARS = 300;
const REDACTED = "[redacted]";

/**
 * Credential-shaped text an upstream error can carry. Meta puts the access token in
 * the request URL (first page and every `paging.next`), and Deno's transport errors
 * print that URL in full ("error sending request for url (https://…?access_token=…)").
 * Each pattern skips text it already redacted, so redacting twice changes nothing.
 */
const SECRET_REDACTIONS: Array<[RegExp, string]> = [
  // access_token=…, "refresh_token": "…" and friends, in a query string or JSON.
  [
    /\b(access[_-]token|refresh[_-]token|client[_-]secret|appsecret[_-]proof|fb[_-]exchange[_-]token|developer[_-]token|api[_-]?key|webhook[_-]secret)(["']?\s*[:=]\s*["']?)(?!\[redacted\])[^&\s"',;)}\]]+/gi,
    `$1$2${REDACTED}`,
  ],
  // Any other query string on a URL.
  [
    /(https?:\/\/[^\s?#"'<>()]+)\?(?!\[redacted\])[^\s"'<>)]*/gi,
    `$1?${REDACTED}`,
  ],
  [/\b(Bearer\s+)(?!\[redacted\])[\w.~+/=-]+/gi, `$1${REDACTED}`],
  // Bare Meta (EAA…) and Google (ya29.…) access tokens.
  [/(?<![A-Za-z0-9])EAA[A-Za-z0-9]{20,}/g, REDACTED],
  [/\bya29\.[\w.-]+/g, REDACTED],
];

/** Upstream error text with credentials removed; safe to store or return. */
/** Percent-encoded separators a URL inside an error can carry (%3D, %3A, %2F…). */
function decodeUrlSeparators(text: string): string {
  return text.replace(/%(2[26F]|3[ADF])/gi, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

export function redactSyncError(text: unknown): string {
  // Decode encoded separators first so an encoded token URL matches the rules below.
  let redacted = decodeUrlSeparators(String(text ?? ""));
  for (const [pattern, replacement] of SECRET_REDACTIONS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

export function isWriteSuccess(status: SyncOutcomeStatus): boolean {
  return status === "ok" || status === "partial";
}

export function buildSyncOutcome(input: {
  status: SyncOutcomeStatus;
  rows?: number;
  levelsOk?: AdsLevel[];
  error?: string | null;
  at?: string;
  source?: string;
}): SyncOutcome {
  const outcome: SyncOutcome = {
    status: input.status,
    rows: Math.max(0, Math.round(Number(input.rows) || 0)),
    at: input.at || new Date().toISOString(),
  };
  if (input.levelsOk) outcome.levels_ok = [...input.levelsOk];
  // Redact before truncating: a cut could otherwise keep part of a token.
  if (input.error)
    outcome.error = redactSyncError(input.error).slice(0, ERROR_MAX_CHARS);
  if (input.source) outcome.source = input.source;
  return outcome;
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
  if (outcome.levels_ok) mirror.levels_ok = [...outcome.levels_ok];
  if (outcome.source) mirror.source = outcome.source;
  return mirror;
}

export type LevelWritePlan = {
  /** False: leave every stored row alone (nothing usable came back). */
  write: boolean;
  /** Final status when `write` is false; the status to record after a clean write otherwise. */
  status: SyncOutcomeStatus;
  /** Levels whose stored rows this run may replace. */
  levelsOk: AdsLevel[];
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
 *   (ads-sync-write.ts) turns it into a clean `ok` when nothing is stored for
 *   those days either, i.e. there was simply no delivery.
 * - A failed ad set or ad level only skips that level: its stored rows are kept and
 *   the run is `partial`.
 */
export function planLevelWrite(input: {
  levelCounts: Partial<Record<AdsLevel, number>>;
  levelErrors?: Partial<Record<AdsLevel, string | null | undefined>>;
  levels?: readonly AdsLevel[];
}): LevelWritePlan {
  const levels = input.levels || ADS_LEVELS;
  const errors = input.levelErrors || {};
  const failed = levels.filter((level) => !!errors[level]);
  const levelsOk = levels.filter((level) => !errors[level]);
  const count = (level: AdsLevel) =>
    Math.max(0, Number(input.levelCounts[level]) || 0);
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  if (status === "failed") return patch;
  if (valid(markers.scheduled_history_from))
    patch.scheduled_history_from = markers.scheduled_history_from;
  if (status === "empty") return patch;
  if (valid(markers.scheduled_synced_through))
    patch.scheduled_synced_through = markers.scheduled_synced_through;
  if (valid(markers.scheduled_lookback_on))
    patch.scheduled_lookback_on = markers.scheduled_lookback_on;
  return patch;
}
