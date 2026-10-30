/**
 * Which report tables are reconciled (AIO-238) and how a stored run reads. The
 * report page imports this file as well as the edge functions, so it imports
 * nothing.
 */

export const RECONCILE_INTEGRATION_TYPES = [
  "facebook_insights",
  "facebook_ecommerce",
  "google_ads",
] as const;

export type ReconcilePlatform = "meta" | "google";

/** The reconciled Meta report types; Carmen's live check covers only these. */
export const META_REPORT_TYPES = RECONCILE_INTEGRATION_TYPES.filter(
  (type) => platformFor(type) === "meta",
);

/** skipped_reason of a table passed over because the platform refused an earlier one. */
export const PLATFORM_RATE_LIMITED = "platform_rate_limited";

/** A stored result older than this says nothing about today's data, so readers ignore it. */
export const RECONCILE_RESULT_MAX_AGE_MS = 3 * 86_400_000;

/** The platform a report type is reconciled against, or null when it is not reconciled. */
export function platformFor(integrationType: string): ReconcilePlatform | null {
  if (
    integrationType === "facebook_insights" ||
    integrationType === "facebook_ecommerce"
  ) {
    return "meta";
  }
  if (integrationType === "google_ads") {
    return "google";
  }
  return null;
}

/**
 * True for a run a rate limit stopped (passed over, or its own request refused).
 * It compared nothing, so it says nothing about the report: the persisting
 * check, the report page's trust line and the status's previous result look
 * past it.
 */
export function isRateLimitRun(
  run: { status?: string | null; summary?: unknown } | null | undefined,
): boolean {
  const raw = run?.summary;
  const summary: object = typeof raw === "object" && raw !== null ? raw : {};
  return (
    (run?.status === "skipped" &&
      "skipped_reason" in summary &&
      summary.skipped_reason === PLATFORM_RATE_LIMITED) ||
    (run?.status === "failed" &&
      "error_kind" in summary &&
      summary.error_kind === "rate_limit")
  );
}
