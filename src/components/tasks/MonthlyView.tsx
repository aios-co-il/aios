import type { Task } from "./taskTypes";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  isSameMonth,
} from "date-fns";
import { useDroppable } from "@dnd-kit/core";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface MonthlyViewProps {
  currentDate: Date;
  tasks: Task[];
  onDayClick: (date: Date) => void;
  onTaskClick: (task: Task) => void;
}

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function DayCell({
  date,
  tasks,
  currentMonth,
  onDayClick,
  onTaskClick,
}: {
  date: Date;
  tasks: Task[];
  currentMonth: Date;
  onDayClick: (date: Date) => void;
  onTaskClick: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: date.toISOString(),
  });

  const dayTasks = tasks.filter(
    (task) => task.due_date && isSameDay(new Date(task.due_date), date),
  );

  const isCurrentMonth = isSameMonth(date, currentMonth);
  const today = isToday(date);
  const completedCount = dayTasks.filter((t) => t.status === "done").length;
  const pendingCount = dayTasks.length - completedCount;

  return (
    <div
      ref={setNodeRef}
      onClick={() => onDayClick(date)}
      className={cn(
        "min-h-[132px] p-2 border-b border-s border-border/60 cursor-pointer transition-colors hover:bg-muted/40",
        !isCurrentMonth && "bg-muted/30 text-muted-foreground",
        isOver && "bg-brand-accent-50 dark:bg-brand-accent-950/40",
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium tabular-nums",
            today && "bg-brand-accent font-bold text-brand-ink",
          )}
        >
          {format(date, "d")}
        </span>
        {dayTasks.length > 0 && (
          <div className="flex gap-1">
            {pendingCount > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-xs font-medium leading-5 tabular-nums">
                {pendingCount}
              </span>
            )}
            {completedCount > 0 && (
              <span className="rounded-full bg-status-active-surface px-1.5 text-xs font-medium leading-5 tabular-nums text-status-foreground">
                ✓{completedCount}
              </span>
            )}
          </div>
        )}
      </div>
      <ScrollArea className="h-[92px]">
        <div className="space-y-1">
          {dayTasks.slice(0, 3).map((task) => (
            <div
              key={task.id}
              onClick={(e) => {
                e.stopPropagation();
                onTaskClick(task);
              }}
              className={cn(
                "truncate rounded-e-md border-s-2 px-1.5 py-0.5 text-xs cursor-pointer",
                task.status === "done"
                  ? "border-s-muted-foreground/40 bg-muted text-muted-foreground line-through"
                  : "border-s-brand-accent bg-brand-accent-50 hover:bg-brand-accent-100 dark:bg-brand-accent-950/60 dark:hover:bg-brand-accent-900/60",
              )}
            >
              {task.due_time && (
                <span className="text-muted-foreground tabular-nums me-1">
                  {task.due_time.substring(0, 5)}
                </span>
              )}
              {task.title}
            </div>
          ))}
          {dayTasks.length > 3 && (
            <p className="text-xs text-muted-foreground text-center">
              +{dayTasks.length - 3} נוספות
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function MonthlyView({
  currentDate,
  tasks,
  onDayClick,
  onTaskClick,
}: MonthlyViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad the beginning of the month to start on Sunday
  const startDay = monthStart.getDay();
  const paddingDays = startDay;

  // Create array with padding
  const calendarDays = [...Array(paddingDays).fill(null), ...days];

  // Pad end to complete the last week
  const remainingDays = (7 - (calendarDays.length % 7)) % 7;
  for (let i = 0; i < remainingDays; i++) {
    calendarDays.push(null);
  }

  return (
    <div className="flex flex-1 md:min-w-[640px] flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-elevation-1">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-7">
          {calendarDays.map((date, index) =>
            date ? (
              <DayCell
                key={date.toISOString()}
                date={date}
                tasks={tasks}
                currentMonth={currentDate}
                onDayClick={onDayClick}
                onTaskClick={onTaskClick}
              />
            ) : (
              <div
                key={`empty-${index}`}
                className="min-h-[132px] p-2 border-b border-s border-border/60 bg-muted/30"
              />
            ),
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
