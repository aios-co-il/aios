import { isSameDay } from "date-fns";
import { followUpDue } from "@/components/leads/followUpDue";

/** Headline counts over the leads the screen has already loaded. */
export interface LeadsSummary {
  createdToday: number;
  followUpToday: number;
  followUpOverdue: number;
}

interface SummaryLead {
  created_at?: string | null;
  follow_up_date?: string | null;
}

/** Counts today's new leads and due or late follow-ups, without a new query. */
export function summarizeLeads(
  leads: ReadonlyArray<SummaryLead>,
  now: Date = new Date(),
): LeadsSummary {
  const summary: LeadsSummary = {
    createdToday: 0,
    followUpToday: 0,
    followUpOverdue: 0,
  };
  for (const lead of leads) {
    if (lead.created_at && isSameDay(new Date(lead.created_at), now)) {
      summary.createdToday += 1;
    }
    const due = followUpDue(lead.follow_up_date, now);
    if (due.isToday) {
      summary.followUpToday += 1;
    }
    if (due.isOverdue) {
      summary.followUpOverdue += 1;
    }
  }
  return summary;
}
