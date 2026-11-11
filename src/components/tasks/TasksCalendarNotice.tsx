import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Invites the user to connect a calendar so its events sit beside the tasks. */
export function TasksCalendarNotice({
  connecting,
  onConnect,
}: {
  connecting: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-accent/30 bg-brand-accent-50 px-4 py-2.5 text-sm dark:bg-brand-accent-950/40">
      <span className="flex items-center gap-2 text-foreground">
        <CalendarDays
          className="h-4 w-4 shrink-0 text-brand-accent-700 dark:text-brand-accent-400"
          aria-hidden="true"
        />
        היומן לא מחובר. חבר Google Calendar מכאן כדי לראות אירועים ליד המשימות.
      </span>
      <Button
        size="sm"
        className="h-8 gap-1.5 rounded-lg"
        onClick={onConnect}
        disabled={connecting}
      >
        <CalendarDays className="h-4 w-4" />
        {connecting ? "מתחבר..." : "חבר יומן"}
      </Button>
    </div>
  );
}
