import { cn } from "@/lib/utils";
import { periodChange } from "./previousPeriod";

export type PreviousValueProps = {
  current: number;
  /** Undefined when the entity did not run in the previous period. */
  previous: number | undefined;
  format: (value: number) => string;
  /** Which way is good news; spend is "neutral". */
  direction: "higher" | "lower" | "neutral";
  /** The table's cell spacing and alignment; the report page's by default. */
  cellClassName?: string;
};

/** How the current value moved against the previous period, for its own cell. */
export type ChangeMark = {
  /** Green when the change is good news, red when it is not, muted otherwise. */
  className: string;
  /** ▲ or ▼, or empty when the value did not move. */
  arrow: string;
};

const REPORT_PAGE_CELL = "p-2 text-center";

/**
 * The change mark of a current value: the arrow and colour go on the current
 * period's figure, so a rise in leads shows on this period's leads.
 */
export function changeMark(
  current: number,
  previous: number,
  direction: PreviousValueProps["direction"],
): ChangeMark {
  const change = periodChange(current, previous, direction);
  return {
    className: cn(
      change === "better" && "text-green-600",
      change === "worse" && "text-red-600",
    ),
    arrow: current > previous ? "▲" : current < previous ? "▼" : "",
  };
}

/** The arrow of a change mark, ahead of the current value it marks. */
export function ChangeArrow({ mark }: { mark: ChangeMark | null }) {
  if (!mark?.arrow) {
    return null;
  }
  return <span aria-hidden="true">{mark.arrow} </span>;
}

/**
 * The previous period's value beside a metric, in muted text: the change it
 * implies is marked on the current value's cell (changeMark).
 */
export function PreviousValueCell({
  previous,
  format,
  cellClassName = REPORT_PAGE_CELL,
}: PreviousValueProps) {
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
