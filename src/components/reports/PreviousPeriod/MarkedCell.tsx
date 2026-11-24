import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ChangeMark } from "./changeMark";

/**
 * A current-period cell of a compared metric: its change mark's colour
 * overrides the cell's own tone, and its arrow leads the value.
 */
export function MarkedCell({
  className,
  mark,
  children,
}: {
  className?: string;
  mark: ChangeMark | null;
  children: ReactNode;
}) {
  return (
    <td className={cn(className, mark?.className)}>
      {mark?.arrow && <span aria-hidden="true">{mark.arrow} </span>}
      {children}
    </td>
  );
}
