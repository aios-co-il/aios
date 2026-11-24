import type { ReactNode } from "react";
import {
  ChangeArrow,
  type ChangeMark,
} from "@/components/reports/PreviousPeriod/PreviousValueCell";
import { cn } from "@/lib/utils";

/**
 * A current-period cell of a compared metric: its change mark's colour
 * overrides the cell's own tone, and its arrow leads the value.
 */
export function MarkedCell({
  className,
  mark,
  children,
}: {
  className: string;
  mark: ChangeMark | null;
  children: ReactNode;
}) {
  return (
    <td className={cn(className, mark?.className)}>
      <ChangeArrow mark={mark} />
      {children}
    </td>
  );
}
