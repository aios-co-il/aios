import { isRecord } from "../../../../supabase/functions/_shared/ads-sync/is-record.ts";
import type { TrackedEvent, TrackedEventRecord } from "./trackedEvents";

/**
 * The two headline figures above the event cards: purchase revenue for the
 * period, and the conversion between two followed events the dashboard
 * names (SwapTix: valuation to sale).
 */

/** The dashboard settings key that holds the conversion pair. */
export const TRACKED_RATIO_SETTING = "tracked_ratio";

/** Two followed events, by GA name: the step and the step it leads to. */
export type TrackedRatio = { from: string; to: string };

/** The conversion card's figures. */
export type RatioFigures = {
  label: string;
  done: number;
  of: number;
  /** done / of; null without anyone at the first step. */
  rate: number | null;
  /** People when GA's unique users are in, else event counts. */
  basis: "people" | "events";
};

/**
 * The conversion pair from a dashboard's settings, kept only while both
 * events are still followed and differ.
 */
export function parseTrackedRatio(
  settings: unknown,
  tracked: Array<TrackedEvent>,
): TrackedRatio | null {
  const raw = isRecord(settings) ? settings[TRACKED_RATIO_SETTING] : null;
  if (!isRecord(raw)) {
    return null;
  }
  const { from, to } = raw;
  const followed = new Set(tracked.map((item) => item.event));
  return typeof from === "string" &&
    typeof to === "string" &&
    from !== to &&
    followed.has(from) &&
    followed.has(to)
    ? { from, to }
    : null;
}

/**
 * The conversion between the pair. People come from GA's unique users when
 * that report is in, since one person can fire an event many times; event
 * counts stand in until it arrives.
 */
export function ratioFigures(
  ratio: TrackedRatio,
  tracked: Array<TrackedEvent>,
  counts: Record<string, number>,
  people: Record<string, number> | undefined,
): RatioFigures {
  const label = (event: string) =>
    tracked.find((item) => item.event === event)?.label ?? event;
  const source = people ?? counts;
  const of = source[ratio.from] ?? 0;
  const done = source[ratio.to] ?? 0;
  return {
    label: `${label(ratio.from)} ← ${label(ratio.to)}`,
    done,
    of,
    rate: of > 0 ? done / of : null,
    basis: people ? "people" : "events",
  };
}

/**
 * Purchase revenue for the period from the GA sync's one-row-per-day report
 * (`daily`), which carries GA's purchase revenue.
 */
export function purchaseRevenue(records: Array<TrackedEventRecord>): number {
  let total = 0;
  for (const record of records) {
    const data = record.data;
    if (
      record._source !== "google_analytics" ||
      !data ||
      data.report_type !== "daily"
    ) {
      continue;
    }
    total += Number(data.purchase_value ?? data.total_revenue) || 0;
  }
  return total;
}
