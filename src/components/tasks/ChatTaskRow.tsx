import { format } from "date-fns";
import { he } from "date-fns/locale";
import { AlertTriangle, CalendarDays, Clock, Repeat } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { isTaskOverdue } from "@/lib/taskDeadline";
import { describeRecurrence } from "@/lib/taskRecurrence";
import { cn } from "@/lib/utils";
import { TaskAssigneeAvatar } from "./TaskAssigneeAvatar";
import { MetaItem, TaskCardMeta } from "./TaskCardMeta";
import type { Task } from "./taskTypes";

/**
 * One task in the chat view's list: tick, title, then the meta line with
 * recurrence, created and due dates. The selected row carries the accent.
 */
export function ChatTaskRow({
  task,
  isSelected,
  today,
  onSelect,
  onToggleComplete,
}: {
  task: Task;
  isSelected: boolean;
  today: Date;
  onSelect: () => void;
  onToggleComplete: (taskId: string, completed: boolean) => void;
}) {
  const overdue = isTaskOverdue(task, today);
  const isDone = task.status === "done";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full border-s-4 border-s-transparent p-3 text-right transition-colors hover:bg-muted/50",
        isSelected &&
          "border-s-brand-accent bg-brand-accent-50 hover:bg-brand-accent-50 dark:bg-brand-accent-950/40 dark:hover:bg-brand-accent-950/40",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5" onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={isDone}
            onCheckedChange={(checked) =>
              onToggleComplete(task.id, Boolean(checked))
            }
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 text-right">
          <div className="flex items-start gap-2">
            <p
              className={cn(
                "flex-1 whitespace-normal break-words text-sm font-semibold leading-snug",
                isDone && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </p>
            {overdue && (
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
                aria-label="באיחור"
              />
            )}
            {task.campaigners?.full_name && (
              <TaskAssigneeAvatar name={task.campaigners.full_name} />
            )}
          </div>
          <TaskCardMeta
            task={task}
            when={<ChatRowDates task={task} overdue={overdue} />}
          />
        </div>
      </div>
    </button>
  );
}

/** Recurrence, created date and due date (red when overdue). */
function ChatRowDates({ task, overdue }: { task: Task; overdue: boolean }) {
  const created = formatCreatedShort(task.created_at);
  const due = task.due_date ? formatDueShort(task.due_date) : null;
  return (
    <>
      {task.recurrence_frequency && (
        <MetaItem icon={<Repeat className="h-3.5 w-3.5" />}>
          {describeRecurrence({
            frequency: task.recurrence_frequency,
            weekday: task.recurrence_weekday,
            monthday: task.recurrence_monthday,
            time: task.due_time,
          }) || "חוזרת"}
        </MetaItem>
      )}
      {created && (
        <span title="נוצרה">
          <MetaItem icon={<Clock className="h-3.5 w-3.5" />}>
            {created}
          </MetaItem>
        </span>
      )}
      {due && (
        <MetaItem
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          className={cn(overdue && "font-medium text-destructive")}
        >
          {due}
          {task.due_time ? ` ${String(task.due_time).substring(0, 5)}` : ""}
        </MetaItem>
      )}
    </>
  );
}

/** "11/11" for a due date, or null when it does not parse. */
function formatDueShort(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return format(parsed, "dd/MM", { locale: he });
}

/** "11/11" this year, "11/11/25" in an earlier one. */
function formatCreatedShort(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const sameYear = parsed.getFullYear() === new Date().getFullYear();
  return format(parsed, sameYear ? "dd/MM" : "dd/MM/yy", { locale: he });
}
