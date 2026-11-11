import type { ReactNode } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/report-ui/StatusChip";
import { cn } from "@/lib/utils";

/**
 * The backlog panel's head in the report-section style: icon, title and
 * status chips for overdue and waiting tasks. `onCollapse` adds the
 * collapse button (desktop only).
 */
export function BacklogPanelHeader({
  overdueCount,
  waitingCount,
  onCollapse,
}: {
  overdueCount: number;
  waitingCount: number;
  onCollapse?: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <ListTodo className="h-5 w-5 text-muted-foreground" />
          רשימת משימות
        </h3>
        {overdueCount > 0 && (
          <StatusChip tone="danger">{overdueCount} באיחור</StatusChip>
        )}
        {waitingCount > 0 && (
          <StatusChip tone="draft">{waitingCount} ללא זמן</StatusChip>
        )}
      </div>
      {onCollapse && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onCollapse}
          aria-label="כווץ רשימה"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </header>
  );
}

/** The collapsed desktop rail: total, an overdue warning, and expand. */
export function BacklogCollapsedRail({
  totalCount,
  hasOverdue,
  onExpand,
}: {
  totalCount: number;
  hasOverdue: boolean;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      className="flex flex-col items-center gap-1.5 py-3"
      onClick={onExpand}
      aria-label="הרחב רשימה"
    >
      <ListTodo className="h-5 w-5 text-muted-foreground" />
      <span className="text-sm font-bold">{totalCount}</span>
      {hasOverdue && <AlertTriangle className="h-4 w-4 text-destructive" />}
      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

/** A titled group of backlog cards with its count. */
export function BacklogSection({
  icon,
  title,
  count,
  danger = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 pt-1">
      <h4
        className={cn(
          "flex items-center gap-1.5 px-1 text-xs font-semibold",
          danger ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {icon}
        {title}
        <span className="tabular-nums opacity-70">· {count}</span>
      </h4>
      {children}
    </section>
  );
}
