import {
  PreviousValueCell,
  type PreviousValueProps,
} from "./PreviousValueCell";

/**
 * The previous-period cell builder of one row: given how to read a metric from
 * the row's data, it renders that metric's previous value, or nothing while
 * the comparison is off. `previous` is null when the entity did not run then.
 */
export function previousCellsFor<T>(
  current: T,
  previous: T | null | undefined,
) {
  return function previousCell(
    value: (data: T) => number,
    format: (value: number) => string,
    direction: PreviousValueProps["direction"],
  ) {
    return (
      previous !== undefined && (
        <PreviousValueCell
          current={value(current)}
          previous={previous ? value(previous) : undefined}
          format={format}
          direction={direction}
        />
      )
    );
  };
}
