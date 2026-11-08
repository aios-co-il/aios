import type { RatioDraft } from "./RatioPicker";
import type { TrackedRatio } from "./siteKpis";
import type { TrackedEvent } from "./trackedEvents";

/** The picked pair, when both sides are followed events and differ. */
export function completeRatio(
  draft: RatioDraft,
  chosen: Array<TrackedEvent>,
): TrackedRatio | null {
  const followed = new Set(chosen.map((item) => item.event));
  const { from, to } = draft;
  return from && to && from !== to && followed.has(from) && followed.has(to)
    ? { from, to }
    : null;
}

export type EditorRow = {
  event: string;
  label: string;
  count: number;
  on: boolean;
};

/** Followed events first, in order, then the period's other events. */
export function editorRows(
  current: Array<TrackedEvent>,
  available: Array<{ event: string; count: number }>,
): Array<EditorRow> {
  const counts = new Map(available.map((item) => [item.event, item.count]));
  const followed = current.map((item) => ({
    ...item,
    count: counts.get(item.event) ?? 0,
    on: true,
  }));
  const chosen = new Set(current.map((item) => item.event));
  const others = available
    .filter((item) => !chosen.has(item.event))
    .map((item) => ({ ...item, label: "", on: false }));
  return [...followed, ...others];
}
