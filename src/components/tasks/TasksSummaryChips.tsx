import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Inbox,
} from "lucide-react";
import { StatChip } from "@/components/report-ui/StatChip";
import type { TaskSummary } from "./taskSummary";

/** The Tasks screen's headline figures, as chips in its toolbar. */
export function TasksSummaryChips({ summary }: { summary: TaskSummary }) {
  return (
    <div className="hidden shrink-0 items-center gap-1.5 xl:flex">
      <StatChip icon={CalendarCheck} value={summary.dueToday} label="להיום" />
      <StatChip
        icon={AlertTriangle}
        value={summary.overdue}
        label="באיחור"
        tone={summary.overdue > 0 ? "danger" : "plain"}
      />
      <StatChip
        icon={Inbox}
        value={summary.awaitingSchedule}
        label="ממתינות"
        title="ממתינות לתזמון"
      />
      <StatChip
        icon={CheckCircle2}
        value={summary.done}
        label="הושלמו"
        title="הושלמו בטווח המוצג"
        tone="success"
      />
    </div>
  );
}
