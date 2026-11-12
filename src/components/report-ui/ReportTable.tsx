import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CampaignStatusSwitch } from "./CampaignStatusSwitch";

/** A report table cell: start-aligned, tabular figures on one line. */
export const REPORT_CELL =
  "px-2 py-2.5 text-start tabular-nums whitespace-nowrap";

/** A figure that is a result (purchases, leads, revenue): in the accent. */
export const REPORT_POSITIVE =
  "font-medium text-brand-accent-700 dark:text-brand-accent-400";

/** A figure that is below break-even, such as a ROAS under 1. */
export const REPORT_NEGATIVE = "text-destructive";

/**
 * The table of a report block, as in the per-goal report: muted heads, thin
 * row rules and a bold total row. It scrolls sideways on narrow screens.
 */
export function ReportTable({
  head,
  children,
  foot,
  className,
}: {
  /** The header cells (ReportTh). */
  head: ReactNode;
  children: ReactNode;
  /** The total row's cells, if the table has one. */
  foot?: ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", className)}>
        <thead className="text-muted-foreground">
          <tr className="border-b">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
        {foot && (
          <tfoot>
            <tr className="border-t-2 font-semibold">{foot}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** A header cell of a report table. */
export function ReportTh({ children }: { children?: ReactNode }) {
  return <th className={cn(REPORT_CELL, "font-medium")}>{children}</th>;
}

/** A body row of a report table. */
export function ReportTr({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b transition-colors last:border-0 hover:bg-muted/40">
      {children}
    </tr>
  );
}

/** A figure cell of a report table. */
export function ReportTd({
  children,
  className,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={cn(REPORT_CELL, className)} colSpan={colSpan}>
      {children}
    </td>
  );
}

/**
 * The name cell of a row: truncated with the full name on hover. A campaign
 * row starts with its compact on/off switch, as in GoalCampaignTable.
 */
export function ReportNameCell({
  name,
  mark,
  on,
  className = "px-2 py-2.5",
}: {
  name: string;
  /** A platform mark before the name. */
  mark?: ReactNode;
  /** The campaign's on/off state; leave out for rows that are not campaigns. */
  on?: boolean | null;
  /** The cell's padding and alignment; the report page's tables pass their own. */
  className?: string;
}) {
  return (
    <td className={cn("max-w-[18rem] font-medium", className)}>
      <span className="flex items-center gap-2">
        {on !== undefined && <CampaignStatusSwitch on={on} compact />}
        {mark && <span className="shrink-0">{mark}</span>}
        <span className="truncate" title={name}>
          {name}
        </span>
      </span>
    </td>
  );
}
