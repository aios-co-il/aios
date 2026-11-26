import { AlarmClock, CalendarClock, Sparkles, Users } from "lucide-react";

import { ModuleSidePanelStat } from "@/components/shared/ModuleSidePanel/ModuleSidePanelStat";
import type { LeadsSummary } from "./leadsSummary";

interface LeadsSummaryListProps {
  shownCount: number;
  totalCount: number;
  summary: LeadsSummary;
  /** The counts cover one page of a longer list. */
  isPaged: boolean;
}

/** Headline counts for the leads on screen, as rows in the side panel. */
export function LeadsSummaryList({
  shownCount,
  totalCount,
  summary,
  isPaged,
}: LeadsSummaryListProps) {
  const scope = isPaged ? "בעמוד הנוכחי" : undefined;

  return (
    <>
      <ModuleSidePanelStat
        icon={Users}
        label="לידים בתצוגה"
        value={shownCount.toLocaleString()}
        title={isPaged ? `מתוך ${totalCount.toLocaleString()}` : undefined}
        tone="success"
      />
      <ModuleSidePanelStat
        icon={Sparkles}
        label="נכנסו היום"
        value={summary.createdToday.toLocaleString()}
        title={scope}
      />
      <ModuleSidePanelStat
        icon={CalendarClock}
        label="חזרה היום"
        value={summary.followUpToday.toLocaleString()}
        title={scope}
      />
      <ModuleSidePanelStat
        icon={AlarmClock}
        label="חזרה באיחור"
        value={summary.followUpOverdue.toLocaleString()}
        title={scope}
        tone={summary.followUpOverdue > 0 ? "danger" : "plain"}
      />
    </>
  );
}
