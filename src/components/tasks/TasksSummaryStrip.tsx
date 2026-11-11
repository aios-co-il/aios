import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Inbox,
} from "lucide-react";
import { ReportKpiCard } from "@/components/report-ui/ReportKpiCard";
import type { TaskSummary } from "./taskSummary";

/** The Tasks screen's headline figures, in the report KPI card design. */
export function TasksSummaryStrip({ summary }: { summary: TaskSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <ReportKpiCard
        label="להיום"
        icon={CalendarCheck}
        value={summary.dueToday}
      />
      <ReportKpiCard
        label="באיחור"
        icon={AlertTriangle}
        value={
          <span className={summary.overdue > 0 ? "text-destructive" : ""}>
            {summary.overdue}
          </span>
        }
      />
      <ReportKpiCard
        label="ממתינות לתזמון"
        icon={Inbox}
        value={summary.awaitingSchedule}
      />
      <ReportKpiCard
        label="הושלמו בטווח המוצג"
        icon={CheckCircle2}
        value={
          <span className="text-brand-accent-700 dark:text-brand-accent-400">
            {summary.done}
          </span>
        }
      />
    </div>
  );
}
