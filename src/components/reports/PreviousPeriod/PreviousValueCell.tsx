import { cn } from "@/lib/utils";

const REPORT_PAGE_CELL = "p-2 text-center";

/**
 * The previous period's value beside a metric, in muted text: the change it
 * implies is marked on the current value's cell (MarkedCell).
 */
export function PreviousValueCell({
  previous,
  format,
  cellClassName = REPORT_PAGE_CELL,
}: {
  /** Undefined when the entity did not run or the metric was not measured then. */
  previous: number | undefined;
  format: (value: number) => string;
  /** The table's cell spacing and alignment; the report page's by default. */
  cellClassName?: string;
}) {
  return (
    <td
      className={cn(
        cellClassName,
        "text-xs whitespace-nowrap text-muted-foreground",
      )}
      title="תקופה קודמת"
    >
      {previous === undefined ? "—" : format(previous)}
    </td>
  );
}

/** Header of a previous-period column. */
export function PreviousValueHead({
  cellClassName = REPORT_PAGE_CELL,
}: {
  cellClassName?: string;
}) {
  return (
    <th
      className={cn(cellClassName, "text-xs font-medium text-muted-foreground")}
    >
      תקופה קודמת
    </th>
  );
}
