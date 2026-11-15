/**
 * How far back the WordPress lead check asks fetch-elementor-submissions to
 * read for one Google Ads sync window.
 *
 * fetch-elementor-submissions keeps submissions newer than
 * `Date.now() - days * 24h`, a lookback from now, not from the window. A past
 * window (a 30-day piece of a longer range, or a cron catch-up slice) must
 * therefore ask for the days from its start through today, or none of its days
 * get submissions and their verified_leads are written as 0.
 */
import { shiftDateString } from "../_shared/report-sync-window.ts";

/** fetch-elementor-submissions reads at most this many days back. */
export const ELEMENTOR_MAX_LOOKBACK_DAYS = 90;

/**
 * Spare days on top of the window: the cutoff falls partway through its
 * oldest day, and submission timestamps are not in Israel time.
 */
const LOOKBACK_MARGIN_DAYS = 2;

export type ElementorLookback = {
  /** `days` to send to fetch-elementor-submissions. */
  days: number;
  /**
   * Oldest day whose submissions are fully fetched. Records before it are
   * left unannotated rather than written as 0 verified leads.
   */
  coveredFrom: string;
};

/** The submission lookback that reaches `windowStart`, capped at the fetch limit. */
export function elementorLookback(
  windowStart: string,
  today: string,
): ElementorLookback {
  const daysBack = Math.max(0, daysBetween(windowStart, today));
  const days = Math.min(
    ELEMENTOR_MAX_LOOKBACK_DAYS,
    daysBack + LOOKBACK_MARGIN_DAYS,
  );
  return {
    days,
    coveredFrom: shiftDateString(today, -(days - LOOKBACK_MARGIN_DAYS)),
  };
}

/**
 * The oldest fully covered day once the fetch result is known. When
 * fetch-elementor-submissions hit its page cap inside the lookback
 * (`truncated`), the oldest fetched day is partial, so coverage starts the day
 * after it; earlier days keep their stored counts (stored-verified-leads.ts).
 */
export function coveredFromFetched(
  coveredFrom: string,
  fetched: {
    truncated?: unknown;
    submissions: Array<{ created_at?: unknown }>;
  },
): string {
  if (fetched.truncated !== true) {
    return coveredFrom;
  }
  const days = fetched.submissions
    .map((sub) =>
      typeof sub.created_at === "string" ? sub.created_at.slice(0, 10) : "",
    )
    .filter(Boolean)
    .sort();
  if (!days.length) {
    return coveredFrom;
  }
  const firstComplete = shiftDateString(days[0], 1);
  return firstComplete > coveredFrom ? firstComplete : coveredFrom;
}

/** Whole calendar days from `from` to `to` (both `yyyy-MM-dd`). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}
