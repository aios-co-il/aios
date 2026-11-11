import { format } from "date-fns";
import { he } from "date-fns/locale";
import { cn } from "@/lib/utils";

/** Weekday, the date in a circle (filled with the accent today) and a count. */
export function DayColumnHeader({
  date,
  today,
  taskCount,
}: {
  date: Date;
  today: boolean;
  taskCount: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b px-3 py-2.5",
        today && "bg-brand-accent-50 dark:bg-brand-accent-950/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-base font-bold tabular-nums",
            today ? "bg-brand-accent text-brand-ink" : "bg-muted",
          )}
        >
          {format(date, "d")}
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">
            {format(date, "EEEE", { locale: he })}
          </p>
          <p className="text-xs text-muted-foreground">
            {today ? "היום" : format(date, "d בMMMM", { locale: he })}
          </p>
        </div>
      </div>
      {taskCount > 0 && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {taskCount === 1 ? "משימה אחת" : `${taskCount} משימות`}
        </span>
      )}
    </div>
  );
}
