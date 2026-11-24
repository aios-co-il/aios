import { cn } from "@/lib/utils";
import { periodChange } from "./previousPeriod";

/** Which way of a metric is good news; spend is "neutral". */
export type ChangeDirection = "higher" | "lower" | "neutral";

/** How a current value moved against the previous period, for its own cell. */
export type ChangeMark = {
  /**
   * Green when the change is good news, red when it is not, with dark-mode
   * variants, so `cn(tone, mark.className)` overrides a cell's own accent.
   */
  className: string;
  /** ▲ or ▼, or empty when the value did not move. */
  arrow: string;
};

/**
 * The change mark of a current value: the arrow and colour go on the current
 * period's figure, so a rise in leads shows on this period's leads.
 */
export function changeMark(
  current: number,
  previous: number,
  direction: ChangeDirection,
): ChangeMark {
  const change = periodChange(current, previous, direction);
  return {
    className: cn(
      change === "better" && "text-green-600 dark:text-green-400",
      change === "worse" && "text-red-600 dark:text-red-400",
    ),
    arrow: current > previous ? "▲" : current < previous ? "▼" : "",
  };
}
