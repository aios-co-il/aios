import {
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
        />
      )
    );
  };
}
