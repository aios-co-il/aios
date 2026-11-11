import { CalendarDays, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { MetaItem } from "./TaskCardMeta";
import type { Task } from "./taskTypes";

/** Due date (red when overdue), target date and creation date of a card. */
export function BacklogDates({
  task,
  isOverdue,
}: {
  task: Task;
  isOverdue: boolean;
}) {
  return (
    <>
      {task.due_date && (
        <MetaItem
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          className={cn(isOverdue && "font-medium text-destructive")}
        >
          {shortDate(task.due_date)}
          {task.due_time ? ` ${String(task.due_time).substring(0, 5)}` : ""}
        </MetaItem>
      )}
      {task.target_date && (
        <MetaItem icon={<Flag className="h-3.5 w-3.5" />}>
          יעד {shortDate(task.target_date)}
        </MetaItem>
      )}
      {task.created_at && (
        <span className="text-[11px]">נוצר {shortDate(task.created_at)}</span>
      )}
    </>
  );
}

/** "11.11" in the Hebrew locale, as the backlog has always shown dates. */
function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
  });
}
