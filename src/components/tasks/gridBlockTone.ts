import { cn } from "@/lib/utils";
import { taskPriorityChip } from "./taskPriorityChip";

/**
 * A time-grid block's colors: tasks sit on the accent tint so they read apart
 * from the grey calendar events, the start edge carries a high or urgent
 * priority, and done tasks fall back to grey.
 */
export function gridBlockTone(priority: number, isCompleted: boolean): string {
  if (isCompleted) {
    return "bg-muted border-border border-s-muted-foreground/40";
  }
  const tone = taskPriorityChip(priority)?.tone;
  return cn(
    "bg-brand-accent-50 border-brand-accent-200 hover:bg-brand-accent-100 dark:bg-brand-accent-950/60 dark:border-brand-accent-800 dark:hover:bg-brand-accent-900/60",
    tone === "danger" && "border-s-destructive dark:border-s-destructive",
    tone === "progress" &&
      "border-s-brand-highlight dark:border-s-brand-highlight",
    !tone && "border-s-brand-accent dark:border-s-brand-accent",
  );
}
