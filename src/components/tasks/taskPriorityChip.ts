import type { StatusTone } from "@/components/report-ui/statusTone";

/** How a task's urgency reads on a card: a chip tone and its label. */
export interface TaskPriorityChip {
  tone: StatusTone;
  label: string;
}

/**
 * The chip for an elevated priority (1–10), or null for an ordinary one.
 * Most tasks keep the default 5, so only high and urgent tasks get a chip;
 * a chip on every card would stop meaning anything.
 */
export function taskPriorityChip(priority: number): TaskPriorityChip | null {
  if (priority >= 8) {
    return { tone: "danger", label: "דחופה" };
  }
  if (priority >= 6) {
    return { tone: "progress", label: "גבוהה" };
  }
  return null;
}
