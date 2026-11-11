import type { Task } from "./taskTypes";
import { useDroppable } from "@dnd-kit/core";
import { Clock, AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { QuickTaskInput, QuickTaskPayload } from "./QuickTaskInput";
import { BacklogTaskCard } from "./BacklogTaskCard";
import {
  BacklogCollapsedRail,
  BacklogPanelHeader,
  BacklogSection,
} from "./BacklogPanelHeader";
import { groupBacklogTasks } from "./groupBacklogTasks";

interface TaskBacklogPanelProps {
  tasks: Task[];
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onTaskClick: (task: Task) => void;
  onAddTask?: (payload: QuickTaskPayload) => void;
  isLoading?: boolean;
  clientsList?: { id: string; name: string }[];
  campaignersList?: { id: string; full_name: string }[];
  defaultCampaignerId?: string | null;
  onUpdateClient?: (taskId: string, clientId: string | null) => void;
  onUpdateCampaigner?: (taskId: string, campaignerId: string | null) => void;
  /** mobileFull = full-height scrollable list for the mobile Tasks page default view */
  variant?: "desktop" | "mobileFull";
}

/**
 * The task backlog (undated, waiting for a time, overdue) as a white report
 * section. Tasks are dragged from here onto the calendar and back.
 */
export function TaskBacklogPanel({
  tasks,
  onToggleComplete,
  onTaskClick,
  onAddTask,
  isLoading,
  clientsList,
  campaignersList,
  onUpdateClient,
  onUpdateCampaigner,
  variant = "desktop",
  defaultCampaignerId,
}: TaskBacklogPanelProps) {
  const isMobileFull = variant === "mobileFull";
  const [isExpanded, setIsExpanded] = useState(true);
  const showExpanded = isMobileFull || isExpanded;
  const { setNodeRef, isOver } = useDroppable({ id: "backlog" });
  const { overdue, untimed, unscheduled } = groupBacklogTasks(
    tasks,
    new Date(),
  );

  function renderCards(list: Array<Task>, isOverdue: boolean) {
    return list.map((task) => (
      <BacklogTaskCard
        key={task.id}
        task={task}
        onToggleComplete={onToggleComplete}
        onClick={() => onTaskClick(task)}
        isOverdue={isOverdue}
        clientsList={clientsList}
        campaignersList={campaignersList}
        onUpdateClient={onUpdateClient}
        onUpdateCampaigner={onUpdateCampaigner}
      />
    ));
  }

  // Always render the panel, even when empty - so user can add tasks
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-2xl border bg-card text-card-foreground shadow-elevation-1 transition-all duration-200",
        isMobileFull
          ? "w-full min-w-0 h-full min-h-0 shrink"
          : cn(
              "shrink-0 h-fit",
              isExpanded ? "min-w-[33vw] w-[33vw]" : "w-[60px]",
            ),
        isOver && "ring-2 ring-brand-accent/60",
      )}
    >
      {showExpanded ? (
        <BacklogPanelHeader
          overdueCount={overdue.length}
          waitingCount={untimed.length + unscheduled.length}
          onCollapse={isMobileFull ? undefined : () => setIsExpanded(false)}
        />
      ) : (
        <BacklogCollapsedRail
          totalCount={tasks.length}
          hasOverdue={overdue.length > 0}
          onExpand={() => setIsExpanded(true)}
        />
      )}

      {showExpanded && (
        <div
          className={cn(
            "space-y-2 overflow-y-auto overscroll-contain p-3",
            isMobileFull
              ? "flex-1 min-h-0"
              : "max-h-[200px] md:max-h-[calc(100vh-250px)]",
          )}
        >
          {onAddTask && (
            <div className="mb-1 border-b pb-3">
              <QuickTaskInput
                onAddTask={onAddTask}
                disabled={isLoading}
                clientsList={clientsList}
                campaignersList={campaignersList}
                defaultCampaignerId={defaultCampaignerId}
              />
            </div>
          )}
          {/* Unscheduled first — newest quick-add tasks appear at the top */}
          {unscheduled.length > 0 && (
            <BacklogSection
              icon={<Inbox className="h-3.5 w-3.5" />}
              title="ללא תאריך"
              count={unscheduled.length}
            >
              {renderCards(unscheduled, false)}
            </BacklogSection>
          )}
          {untimed.length > 0 && (
            <BacklogSection
              icon={<Clock className="h-3.5 w-3.5" />}
              title="ממתין לזמן"
              count={untimed.length}
            >
              {renderCards(untimed, false)}
            </BacklogSection>
          )}
          {overdue.length > 0 && (
            <BacklogSection
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              title="באיחור"
              count={overdue.length}
              danger
            >
              {renderCards(overdue, true)}
            </BacklogSection>
          )}
          {tasks.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              אין משימות ממתינות
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Keep old export for backwards compatibility
export const OverdueTasksPanel = TaskBacklogPanel;
