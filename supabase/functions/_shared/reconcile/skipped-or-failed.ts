/**
 * The result of a table that was not compared: skipped (and why) or failed
 * (with the redacted error and no findings) (AIO-238).
 */
import { ReconcileSourceError, redactedMessage } from "./errors.ts";
import type { ReconcilePlatform } from "./run-status.ts";
import type { RunSummary, TableReconcileResult } from "./run-summary.ts";
import type { SourceErrorKind } from "./types.ts";
import type { ReconcileWindow } from "./window.ts";

/** A run that compared nothing, and why. */
export function skippedResult(
  platform: ReconcilePlatform | null,
  summary: RunSummary,
  reason: string,
): TableReconcileResult {
  return {
    status: "skipped",
    platform,
    window_start: null,
    window_end: null,
    findings: [],
    summary: { ...summary, skipped_reason: reason },
  };
}

/** A failed run with the redacted error and no findings. */
export function errorResult(
  platform: ReconcilePlatform | null,
  window: ReconcileWindow | null,
  kind: SourceErrorKind | "aios_read",
  error: unknown,
  summary: RunSummary,
): TableReconcileResult {
  return {
    status: "failed",
    platform,
    window_start: window?.start || null,
    window_end: window?.end || null,
    findings: [],
    error_kind: kind,
    ...(kind === "rate_limit"
      ? {
          rate_limit_scope:
            error instanceof ReconcileSourceError ? error.scope : "platform",
        }
      : {}),
    summary: { ...summary, error_kind: kind, error: redactedMessage(error) },
  };
}

/** The failure kind of a caught value; anything but a source error is a platform failure. */
export function sourceErrorKind(err: unknown): SourceErrorKind {
  return err instanceof ReconcileSourceError ? err.kind : "platform";
}
