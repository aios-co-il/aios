import type { PairUsers } from "../../../../supabase/functions/ga-event-users/reports.ts";
import {
  parseTrackedRatio,
  TRACKED_RATIO_SETTING,
  type TrackedRatio,
} from "../../../../supabase/functions/ga-event-users/tracked-ratio.ts";
import type { TrackedEvent, TrackedEventRecord } from "./trackedEvents";

export { parseTrackedRatio, TRACKED_RATIO_SETTING, type TrackedRatio };

/**
 * The two headline figures above the event cards: purchase revenue for the
 * period, and the conversion between two followed events the dashboard
 * names (SwapTix: valuation to sale).
 */

/** The conversion card's figures. */
export type RatioFigures = {
  label: string;
  done: number;
  of: number;
  /** done / of; null without anyone at the first step. */
  rate: number | null;
  /** People from GA's funnel for the pair when it is in, else event counts. */
  basis: "people" | "events";
};

/**
 * The conversion between the pair. GA's two-step closed funnel gives the
 * people who did the first event and, of them, those who went on to the
 * second, so it never passes 100%; event counts stand in until it arrives.
 */
export function ratioFigures(
  ratio: TrackedRatio,
  tracked: Array<TrackedEvent>,
  counts: Record<string, number>,
  pair: PairUsers | null | undefined,
): RatioFigures {
  const label = (event: string) =>
    tracked.find((item) => item.event === event)?.label ?? event;
  const of = pair ? pair.from : (counts[ratio.from] ?? 0);
  const done = pair ? pair.to : (counts[ratio.to] ?? 0);
  return {
    label: `${label(ratio.from)} ← ${label(ratio.to)}`,
    done,
    of,
    rate: of > 0 ? done / of : null,
    basis: pair ? "people" : "events",
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
