import type { Task } from "./taskTypes";
import { format, isToday } from "date-fns";
import { he } from "date-fns/locale";
import { useDroppable } from "@dnd-kit/core";
import { Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { generateWorkdayTimeSlots } from "@/lib/taskWorkdayHours";
import { DailyTaskCard } from "./DailyTaskCard";

interface DailyViewProps {
  date: Date;
  tasks: Task[];
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onTaskClick: (task: Task) => void;
  onDropOnSlot: (taskId: string, time: string) => void;
}

const TIME_SLOTS = generateWorkdayTimeSlots();

/** One day as a white card: its date, untimed tasks, then the hour grid. */
export function DailyView({
  date,
  tasks,
  onToggleComplete,
  onTaskClick,
}: DailyViewProps) {
  // Tasks without a specific time
  const untimedTasks = tasks.filter((t) => !t.due_time);
  const today = isToday(date);

  return (
    <div className="flex min-w-[420px] flex-1 flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-elevation-1">
      <div
        className={cn(
          "flex items-center gap-3 border-b px-5 py-4",
          today && "bg-brand-accent-50 dark:bg-brand-accent-950/40",
        )}
      >
        <span
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold tabular-nums",
            today ? "bg-brand-accent text-brand-ink" : "bg-muted",
          )}
        >
          {format(date, "d")}
        </span>
        <div className="leading-tight">
          <p className="text-lg font-bold">
            {format(date, "EEEE", { locale: he })}
          </p>
          <p className="text-sm text-muted-foreground">
            {format(date, "d בMMMM yyyy", { locale: he })}
          </p>
        </div>
      </div>

      {untimedTasks.length > 0 && (
        <div className="space-y-2 border-b bg-muted/40 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            ללא שעה · {untimedTasks.length}
          </p>
          <div className="grid gap-2 lg:grid-cols-2">
            {untimedTasks.map((task) => (
              <DailyTaskCard
                key={task.id}
                task={task}
                onToggleComplete={onToggleComplete}
                onClick={() => onTaskClick(task)}
              />
            ))}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div>
          {TIME_SLOTS.map((time) => (
            <TimeSlot
              key={time}
              time={time}
              tasks={tasks}
              date={date}
              onToggleComplete={onToggleComplete}
              onTaskClick={onTaskClick}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

/** One hour row of the day: its time and the tasks dropped into it. */
function TimeSlot({
  time,
  tasks,
  date,
  onToggleComplete,
  onTaskClick,
}: {
  time: string;
  tasks: Task[];
  date: Date;
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onTaskClick: (task: Task) => void;
}) {
  const droppableId = `${date.toISOString()}_${time}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
  });

  const slotTasks = tasks.filter((t) => {
    if (!t.due_time) return false;
    // Format time to match HH:MM
    const taskTime = t.due_time.substring(0, 5);
    return taskTime === time;
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[52px] border-b border-border/60 transition-colors",
        time.endsWith(":30") && "border-dashed",
        isOver && "bg-brand-accent-50 dark:bg-brand-accent-950/40",
      )}
    >
      <div className="w-16 flex-shrink-0 p-2 text-xs font-medium tabular-nums text-muted-foreground">
        {time}
      </div>
      <div className="flex-1 space-y-1.5 p-1.5">
        {slotTasks.map((task) => (
          <DailyTaskCard
            key={task.id}
            task={task}
            onToggleComplete={onToggleComplete}
            onClick={() => onTaskClick(task)}
          />
        ))}
      </div>
    </div>
  );
}
