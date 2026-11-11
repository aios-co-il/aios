import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Previous / next / today for the calendar views. In RTL the "previous"
 * arrow points right and comes first, so time reads from right to left.
 */
export function TasksPeriodNav({
  onPrev,
  onNext,
  onToday,
}: {
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onPrev}
        aria-label="הקודם"
        title="הקודם"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        onClick={onToday}
        className="h-8 gap-1.5 rounded-lg px-3 text-xs"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        היום
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onNext}
        aria-label="הבא"
        title="הבא"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}
