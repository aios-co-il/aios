import { cn } from "@/lib/utils";
import { periodChange } from "./previousPeriod";

export type PreviousValueProps = {
  current: number;
  /** Undefined when the entity did not run in the previous period. */
  previous: number | undefined;
  format: (value: number) => string;
  /** Which way is good news; spend is "neutral". */
  direction: "higher" | "lower" | "neutral";
};

/**
 * The previous period's value beside a metric, with an arrow for the way it
 * moved: green when the change is good news, red when it is not.
 */
export function PreviousValueCell({
  current,
  previous,
  format,
  direction,
}: PreviousValueProps) {
  if (previous === undefined) {
    return <td className="p-2 text-center text-xs text-muted-foreground">—</td>;
  }
  const change = periodChange(current, previous, direction);
  const arrow = current > previous ? "▲" : current < previous ? "▼" : "";
  return (
    <td
      className={cn(
        "p-2 text-center text-xs whitespace-nowrap",
        change === "better" && "text-green-600",
        change === "worse" && "text-red-600",
        change === "same" && "text-muted-foreground",
      )}
      title="תקופה קודמת"
    >
      {arrow && <span aria-hidden="true">{arrow} </span>}
      {format(previous)}
    </td>
  );
}

/** Header of a previous-period column. */
export function PreviousValueHead() {
  return (
    <th className="p-2 text-center text-xs font-medium text-muted-foreground">
      תקופה קודמת
    </th>
  );
}
