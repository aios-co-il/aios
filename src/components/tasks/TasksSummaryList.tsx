import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Inbox,
} from "lucide-react";

import { ModuleSidePanelStat } from "@/components/shared/ModuleSidePanel/ModuleSidePanelStat";
import type { TaskSummary } from "./taskSummary";

/** The Tasks screen's headline figures, as rows in its side panel. */
export function TasksSummaryList({ summary }: { summary: TaskSummary }) {
  return (
    <>
      <ModuleSidePanelStat
        icon={CheckCircle2}
        value={summary.done}
        label="הושלמו"
        title="הושלמו בטווח המוצג"
        tone="success"
      />
      <ModuleSidePanelStat
        icon={Inbox}
        value={summary.awaitingSchedule}
        label="ממתינות"
        title="ממתינות לתזמון"
      />
      <ModuleSidePanelStat
        icon={AlertTriangle}
        value={summary.overdue}
        label="באיחור"
        tone={summary.overdue > 0 ? "danger" : "plain"}
      />
      <ModuleSidePanelStat
        icon={CalendarCheck}
        value={summary.dueToday}
        label="להיום"
      />
    </>
  );
}
