/**
 * The "spend without results" rule (AIO-502): a lead or sales campaign that
 * spent with 0 results over the client's last N full days is an exception.
 * N is clients.pulse_no_results_days (David, 2026-11-07); the database holds it
 * between 1 and 30 with a default of 7, and the pulse reads it through here.
 */
import type { PulseCampaignStatus } from "./targetless-status.ts";

/** The days a client without its own setting waits: the pulse's fixed rule before AIO-502. */
export const DEFAULT_NO_RESULTS_DAYS = 7;

/** The range the clients column's check constraint allows. */
export const MIN_NO_RESULTS_DAYS = 1;
export const MAX_NO_RESULTS_DAYS = 30;

/** A window's totals as the rule reads them; `outcomes` null means the source has no result field. */
export type WindowTotals = { spend: number; outcomes: number | null };

/**
 * The client's stored days: a missing or non-numeric value is the default, and
 * a number outside 1–30 (the column refuses one) is clamped into the range.
 */
export function resolveNoResultsDays(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") {
    return DEFAULT_NO_RESULTS_DAYS;
  }
  const days = Math.round(Number(raw));
  if (!Number.isFinite(days)) {
    return DEFAULT_NO_RESULTS_DAYS;
  }
  return Math.min(MAX_NO_RESULTS_DAYS, Math.max(MIN_NO_RESULTS_DAYS, days));
}

/** The first day of the client's window, ending on the last full day (YYYY-MM-DD). */
export function noResultsWindowStart(
  lastFullDay: string,
  days: number,
): string {
  const end = Date.parse(`${lastFullDay}T00:00:00Z`);
  return new Date(end - (days - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** The exception's reason; for 7 days it is the text the pulse always sent. */
export function noResultsReason(days: number): string {
  return days === 1
    ? "קיימת הוצאה ללא תוצאות ביום המלא האחרון"
    : `קיימת הוצאה ללא תוצאות ב־${days} הימים המלאים האחרונים`;
}

/**
 * The reason a campaign_exception fingerprint uses: the no-results reason of
 * any window is the default window's, so changing a client's days never makes
 * an alert already sent look like a new finding.
 */
export function noResultsFindingReason(reason: string, days: unknown): string {
  return reason === noResultsReason(resolveNoResultsDays(days))
    ? noResultsReason(DEFAULT_NO_RESULTS_DAYS)
    : reason;
}

/**
 * The no-results status of a campaign, or null when the rule does not apply.
 * It alerts when the client's window spent with 0 results; a window shorter
 * than 7 days also alerts on 7 days of 0 results (the longer streak includes
 * the shorter). A longer window holds 7 days of 0 results as a yellow watch.
 */
export function noResultsStatus(
  days: number,
  window: WindowTotals,
  current7: WindowTotals,
): PulseCampaignStatus | null {
  if (
    spentWithoutResults(window) ||
    (days < DEFAULT_NO_RESULTS_DAYS && spentWithoutResults(current7))
  ) {
    return {
      status: "critical",
      tier: "exception",
      reason: noResultsReason(days),
      alertEligible: true,
    };
  }
  if (spentWithoutResults(current7)) {
    return {
      status: "warning",
      tier: "watch",
      reason: `${noResultsReason(DEFAULT_NO_RESULTS_DAYS)}; התראה אחרי ${days} ימים בלי תוצאות`,
      alertEligible: false,
    };
  }
  return null;
}

/** Spend with a result count of exactly 0 (a missing count is not 0). */
function spentWithoutResults(totals: WindowTotals): boolean {
  return totals.spend > 0 && totals.outcomes === 0;
}
