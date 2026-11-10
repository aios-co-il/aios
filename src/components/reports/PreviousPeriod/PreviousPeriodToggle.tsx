import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PeriodRange } from "./previousPeriod";

type Props = {
  on: boolean;
  onChange: (on: boolean) => void;
  /** The window compared with; null when the report has no previous period. */
  range: PeriodRange | null;
  loading: boolean;
};

/** Turns the previous-period columns of the report's tables on and off. */
export function PreviousPeriodToggle({ on, onChange, range, loading }: Props) {
  const disabled = range === null;
  return (
    <Button
      variant={on ? "default" : "outline"}
      size="sm"
      aria-pressed={on}
      disabled={disabled}
      title={
        disabled
          ? "אין תקופה קודמת לטווח הזה"
          : `השוואה ל-${formatDay(range.startDate)}–${formatDay(range.endDate)}`
      }
      onClick={() => onChange(!on)}
    >
      <History className="h-4 w-4 ml-1" />
      {on && loading ? "טוען תקופה קודמת..." : "השוואה לתקופה קודמת"}
    </Button>
  );
}

/** yyyy-MM-dd as dd/MM. */
function formatDay(day: string): string {
  const [, month, date] = day.split("-");
  return `${date}/${month}`;
}
