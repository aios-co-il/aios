import type { ReactNode } from "react";
import { CalendarDays, Filter, ListChecks, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TasksPeriodNav } from "./TasksPeriodNav";
import { TasksViewSwitcher } from "./TasksViewSwitcher";
import { tasksPeriodLabel } from "./tasksPeriodLabel";
import type { ViewMode } from "./WeeklyTaskBoard";

interface TasksBoardHeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (value: string) => void;
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** The chat view's search box, shown in place of the period. */
  chatSearch: ReactNode;
  toolbarFilters: ReactNode;
  activeFiltersCount: number;
  onOpenFilters: () => void;
  /** The headline figures, as chips before the calendar action. */
  summary: ReactNode;
  calendar: {
    connected: boolean;
    syncing: boolean;
    connecting: boolean;
    onSync: () => void;
    onConnect: () => void;
  };
}

/**
 * The desktop head of the Tasks screen as one white bar: title and period,
 * navigation, filters, the headline figures, calendar sync and the views.
 */
export function TasksBoardHeader({
  viewMode,
  onViewModeChange,
  currentDate,
  onPrev,
  onNext,
  onToday,
  chatSearch,
  toolbarFilters,
  activeFiltersCount,
  onOpenFilters,
  summary,
  calendar,
}: TasksBoardHeaderProps) {
  const isCalendarView = viewMode !== "chat";
  return (
    <div className="hidden shrink-0 flex-wrap items-center gap-2 rounded-2xl border bg-card px-3 py-2 shadow-elevation-1 md:flex">
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-accent-100 text-brand-accent-800 dark:bg-brand-accent-900 dark:text-brand-accent-200">
          <ListChecks className="h-4 w-4" aria-hidden="true" />
        </span>
        <h1 className="text-base font-bold leading-none">משימות</h1>
        {isCalendarView && (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {tasksPeriodLabel(viewMode, currentDate)}
          </span>
        )}
      </div>
      <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden="true" />
      {isCalendarView ? (
        <TasksPeriodNav onPrev={onPrev} onNext={onNext} onToday={onToday} />
      ) : (
        chatSearch
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {toolbarFilters}
        <Button
          variant="ghost"
          className="relative h-8 shrink-0 gap-1.5 px-2 text-xs"
          onClick={onOpenFilters}
        >
          <Filter className="h-3.5 w-3.5" />
          מתקדם
          {activeFiltersCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-accent px-1 text-[10px] font-bold text-brand-ink">
              {activeFiltersCount}
            </span>
          )}
        </Button>
      </div>
      {summary}
      {isCalendarView && <CalendarAction {...calendar} />}
      <TasksViewSwitcher value={viewMode} onChange={onViewModeChange} />
    </div>
  );
}

/** Sync to the connected calendar, or connect one. */
function CalendarAction({
  connected,
  syncing,
  connecting,
  onSync,
  onConnect,
}: TasksBoardHeaderProps["calendar"]) {
  if (connected) {
    return (
      <Button
        variant="outline"
        className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-xs"
        onClick={onSync}
        disabled={syncing}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
        סנכרן
      </Button>
    );
  }
  return (
    <Button
      className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-xs"
      onClick={onConnect}
      disabled={connecting}
    >
      <CalendarDays
        className={cn("h-3.5 w-3.5", connecting && "animate-pulse")}
      />
      {connecting ? "מתחבר..." : "חבר יומן"}
    </Button>
  );
}
