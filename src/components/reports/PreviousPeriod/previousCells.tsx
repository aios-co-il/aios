import {
  changeMark,
  type ChangeMark,
  PreviousValueCell,
  type PreviousValueProps,
} from "./PreviousValueCell";

/**
 * The previous-period cell builder of one row: given how to read a metric from
 * the row's data, it renders that metric's previous value, or nothing while
 * the comparison is off. `previous` is null when the entity did not run then;
 * a metric that reads null (not measured then, like followers before they
 * were synced) shows a dash rather than a false 0.
 */
export function previousCellsFor<T>(
  current: T,
  previous: T | null | undefined,
  cellClassName?: string,
) {
  return function previousCell(
    value: (data: T) => number | null,
    format: (value: number) => string,
    direction: PreviousValueProps["direction"],
  ) {
    const before = previous ? value(previous) : null;
    return (
      previous !== undefined && (
        <PreviousValueCell
          current={value(current) ?? 0}
          previous={before ?? undefined}
          format={format}
          direction={direction}
          cellClassName={cellClassName}
        />
      )
    );
  };
}

/**
 * The change-mark reader of one row: the arrow and colour of a metric's
 * current value against the previous period, for the current value's own
 * cell. Null while the comparison is off, when the entity did not run then, or
 * when the metric was not measured then.
 */
export function changeMarksFor<T>(current: T, previous: T | null | undefined) {
  return function markOf(
    value: (data: T) => number | null,
    direction: PreviousValueProps["direction"],
  ): ChangeMark | null {
    const before = previous ? value(previous) : null;
    if (before === null) {
      return null;
    }
    return changeMark(value(current) ?? 0, before, direction);
  };
}
