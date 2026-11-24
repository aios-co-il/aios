import type { ReactNode } from "react";
import {
  changeMark,
  type ChangeDirection,
  type ChangeMark,
} from "./changeMark";
import { PreviousValueCell } from "./PreviousValueCell";

/** One compared metric of a row: its current cell's mark and its previous cell. */
export type ComparedMetric = {
  /** Null while the comparison is off or when either period has no value. */
  mark: ChangeMark | null;
  /** The previous value's cell; nothing while the comparison is off. */
  previousCell: ReactNode;
};

/**
 * The comparison builder of one row: given how to read a metric from the row's
 * data, its format and which way is good news, it returns the mark for the
 * current value's cell and the previous value's cell, so the two always use
 * the same reader and direction. `previous` is undefined with the comparison
 * off and null when the entity did not run then. A metric that reads null in
 * a period (not measured, like followers before they were synced, or a cost
 * per lead with no leads) shows a dash and gets no mark.
 */
export function compareCellsFor<T>(
  current: T,
  previous: T | null | undefined,
  cellClassName?: string,
) {
  return function compared(
    value: (data: T) => number | null,
    format: (value: number) => string,
    direction: ChangeDirection,
  ): ComparedMetric {
    const now = value(current);
    const before = previous ? value(previous) : null;
    return {
      mark:
        now === null || before === null
          ? null
          : changeMark(now, before, direction),
      previousCell: previous !== undefined && (
        <PreviousValueCell
          previous={before ?? undefined}
          format={format}
          cellClassName={cellClassName}
        />
      ),
    };
  };
}
