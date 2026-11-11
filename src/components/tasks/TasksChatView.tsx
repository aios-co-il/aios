import type { Task } from "./taskTypes";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  LayoutList,
  Repeat,
  Search,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TaskDetailDialog } from "./TaskDetailDialog";
import { QuickTaskInput, type QuickTaskPayload } from "./QuickTaskInput";
import { ChatTaskRow } from "./ChatTaskRow";
import {
  filterTasksForChatSearch,
  sortTasksForChatList,
} from "@/lib/taskBoardQuery";
import type { OpenClosedFilter } from "@/lib/taskFilters";

export type ChatTask = Task;

// Tabs share one brand style; the icon and label tell them apart, not hue.
const TAB_STYLE = {
  active: "bg-card text-foreground shadow-elevation-1",
  idle: "text-muted-foreground hover:text-foreground",
  countActive:
    "bg-brand-accent-100 text-brand-accent-800 dark:bg-brand-accent-900 dark:text-brand-accent-200",
  countIdle: "bg-background/60 text-muted-foreground",
};

const OPEN_CLOSED_TABS: Array<{
  value: OpenClosedFilter;
  label: string;
  icon: typeof LayoutList;
}> = [
  { value: "all", label: "הכל", icon: LayoutList },
  { value: "open", label: "פתוחות", icon: CircleDot },
  { value: "done", label: "סגורות", icon: CheckCircle2 },
];

export function TasksChatSearchInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <Input
        placeholder="חיפוש משימה או לקוח..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full pr-7 text-xs bg-card"
      />
    </div>
  );
}

interface TasksChatViewProps {
  tasks: ChatTask[];
  selectedTaskId: string | null;
  onSelectTask: (task: ChatTask | null) => void;
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onDelete: (taskId: string, googleCalendarEventId?: string | null) => void;
  onMoveToBacklog?: (taskId: string) => void;
  onAddTask?: (payload: QuickTaskPayload) => void;
  isLoading?: boolean;
  clientsList?: { id: string; name: string }[];
  campaignersList?: { id: string; full_name: string }[];
  defaultCampaignerId?: string | null;
  openClosedFilter?: OpenClosedFilter;
  onOpenClosedFilterChange?: (value: OpenClosedFilter) => void;
  showAllRecurring?: boolean;
  onShowAllRecurringChange?: (value: boolean) => void;
  listSearch?: string;
  onListSearchChange?: (value: string) => void;
  hideListSearch?: boolean;
}

export function TasksChatView({
  tasks,
  selectedTaskId,
  onSelectTask,
  onToggleComplete,
  onDelete,
  onMoveToBacklog,
  onAddTask,
  isLoading,
  clientsList,
  campaignersList,
  defaultCampaignerId,
  openClosedFilter = "open",
  onOpenClosedFilterChange,
  showAllRecurring = false,
  onShowAllRecurringChange,
  listSearch: listSearchProp,
  onListSearchChange,
  hideListSearch = false,
}: TasksChatViewProps) {
  const isMobile = useIsMobile();
  const [uncontrolledSearch, setUncontrolledSearch] = useState("");
  const listSearch = onListSearchChange
    ? (listSearchProp ?? "")
    : uncontrolledSearch;
  const setListSearch = onListSearchChange ?? setUncontrolledSearch;
  const setOpenClosedFilter = onOpenClosedFilterChange ?? (() => undefined);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const searchedTasks = useMemo(
    () => filterTasksForChatSearch(tasks, listSearch),
    [tasks, listSearch],
  );

  const tabCounts = useMemo(
    () => ({
      all: searchedTasks.length,
      open: searchedTasks.filter((task) => task.status !== "done").length,
      done: searchedTasks.filter((task) => task.status === "done").length,
    }),
    [searchedTasks],
  );

  const filteredTasks = useMemo(() => {
    const byOpenClosed =
      openClosedFilter === "all"
        ? searchedTasks
        : openClosedFilter === "done"
          ? searchedTasks.filter((task) => task.status === "done")
          : searchedTasks.filter((task) => task.status !== "done");
    return sortTasksForChatList(byOpenClosed, today);
  }, [searchedTasks, openClosedFilter, today]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  useEffect(() => {
    if (isMobile) return;
    const stillPresent = Boolean(
      selectedTaskId && tasks.some((task) => task.id === selectedTaskId),
    );
    const nextTask = filteredTasks[0];
    if (!stillPresent && nextTask && nextTask.id !== selectedTaskId) {
      onSelectTask(nextTask);
    }
  }, [isMobile, selectedTaskId, tasks, filteredTasks, onSelectTask]);

  const handleSelect = useCallback(
    (task: ChatTask) => {
      onSelectTask(task);
    },
    [onSelectTask],
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-0 max-h-full overflow-hidden bg-card w-full",
        isMobile
          ? "border-0 rounded-none"
          : "border rounded-2xl shadow-elevation-1",
      )}
      dir="rtl"
    >
      <div
        className={cn(
          "flex flex-col bg-card overflow-hidden min-h-0",
          isMobile
            ? "w-full flex-1"
            : "w-[28%] min-w-[260px] max-w-[28%] border-s",
        )}
        dir="rtl"
      >
        <div
          className={cn(
            "border-b bg-card shrink-0 space-y-2",
            isMobile ? "p-1.5" : "p-3",
          )}
        >
          {!hideListSearch && (
            <TasksChatSearchInput
              value={listSearch}
              onChange={setListSearch}
              className="w-full"
            />
          )}
          <div className="flex items-center gap-0.5 min-w-0 rounded-xl bg-muted p-1">
            {OPEN_CLOSED_TABS.map((tab) => {
              const active = openClosedFilter === tab.value;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setOpenClosedFilter(tab.value)}
                  className={cn(
                    "h-7 flex-1 rounded-lg text-[11px] font-semibold transition-colors inline-flex items-center justify-center gap-0.5 px-1 min-w-0",
                    active ? TAB_STYLE.active : TAB_STYLE.idle,
                  )}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  <span
                    className={cn(
                      "min-w-4 rounded-full px-1 text-[10px] leading-4 font-bold",
                      active ? TAB_STYLE.countActive : TAB_STYLE.countIdle,
                    )}
                  >
                    {tabCounts[tab.value]}
                  </span>
                </button>
              );
            })}
          </div>
          {onShowAllRecurringChange && (
            <button
              type="button"
              onClick={() => onShowAllRecurringChange(!showAllRecurring)}
              className={cn(
                "w-full h-7 rounded-md text-[11px] font-semibold transition-colors inline-flex items-center justify-center gap-1 px-2",
                showAllRecurring
                  ? "bg-brand-accent/10 text-foreground border border-brand-accent/30"
                  : "text-muted-foreground hover:bg-muted/60 border border-transparent",
              )}
              title="הצג משימות חוזרות גם לפני מועד הביצוע"
            >
              <Repeat className="h-3 w-3 shrink-0" />
              משימות חוזרות
            </button>
          )}
          {onAddTask && (
            <QuickTaskInput
              onAddTask={onAddTask}
              disabled={isLoading}
              clientsList={clientsList}
              campaignersList={campaignersList}
              defaultCampaignerId={defaultCampaignerId}
            />
          )}
        </div>

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 [scrollbar-width:thin]"
          dir="rtl"
        >
          <div className="divide-y" dir="rtl">
            {filteredTasks.map((task) => (
              <ChatTaskRow
                key={task.id}
                task={task}
                isSelected={task.id === selectedTaskId}
                today={today}
                onSelect={() => handleSelect(task)}
                onToggleComplete={onToggleComplete}
              />
            ))}
            {filteredTasks.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                {isLoading ? "טוען משימות..." : "לא נמצאו משימות"}
              </div>
            )}
          </div>
        </div>
      </div>

      {!isMobile && (
        <div
          className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0 bg-muted/30"
          dir="rtl"
        >
          <TaskDetailDialog
            key={selectedTask?.id ?? "empty"}
            task={selectedTask}
            open={Boolean(selectedTask)}
            variant="panel"
            onOpenChange={(open) => {
              if (!open) onSelectTask(null);
            }}
            onDelete={(taskId) => {
              const idx = filteredTasks.findIndex((task) => task.id === taskId);
              const next =
                filteredTasks[idx + 1] || filteredTasks[idx - 1] || null;
              onDelete(taskId, selectedTask?.google_calendar_event_id);
              onSelectTask(next);
            }}
            onMoveToBacklog={onMoveToBacklog}
          />
        </div>
      )}

      {isMobile && (
        <TaskDetailDialog
          key={selectedTask?.id ?? "empty"}
          task={selectedTask}
          open={Boolean(selectedTask)}
          variant="dialog"
          onOpenChange={(open) => {
            if (!open) onSelectTask(null);
          }}
          onDelete={(taskId) => {
            onDelete(taskId, selectedTask?.google_calendar_event_id);
            onSelectTask(null);
          }}
          onMoveToBacklog={onMoveToBacklog}
        />
      )}
    </div>
  );
}
