import { isRecord } from "../_shared/ads-sync/is-record.ts";
import type { TrackedEvent } from "./tracked-events.ts";

/**
 * The two followed events whose conversion a dashboard shows as a card
 * (SwapTix: valuation to sale), from its settings (`tracked_ratio`). The
 * dashboard editor and the event-users function read the same pair.
 */

/** The dashboard settings key that holds the conversion pair. */
export const TRACKED_RATIO_SETTING = "tracked_ratio";

/** Two followed events, by GA name: the step and the step it leads to. */
export type TrackedRatio = { from: string; to: string };

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
