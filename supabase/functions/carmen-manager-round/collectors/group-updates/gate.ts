/**
 * What the collector does with a group window (deterministic):
 * - nothing substantive: the watermark moves on;
 * - a person updated the card after the first substantive message: the card
 *   is current, the watermark moves on;
 * - fewer than MIN_SUBSTANTIVE substantive messages: wait for more (the
 *   watermark stays, the lookback still bounds the window);
 * - otherwise: digest it (one model call, or the markers).
 */
import { type CardEntry, humanUpdateAfter } from "./card-entries.ts";
import { type GroupWindow, substantive } from "./windows.ts";

export const MIN_SUBSTANTIVE = 3;

export type WindowAction = "advance" | "wait" | "digest";

/** The action for one window, given the tenant's card entries. */
export function gateWindow(
  window: GroupWindow,
  entries: CardEntry[],
): WindowAction {
  const counted = substantive(window);
  const first = counted[0];
  if (!first || humanUpdateAfter(entries, window.clientId, first.at)) {
    return "advance";
  }
  return counted.length < MIN_SUBSTANTIVE ? "wait" : "digest";
}
