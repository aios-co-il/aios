import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The brand book's status chips; each tone follows the theme in light and dark. */
export type StatusTone = "active" | "progress" | "draft" | "danger";

const TONE_CLASS: Record<StatusTone, string> = {
  active: "bg-status-active-surface text-status-foreground",
  progress: "bg-status-progress-surface text-status-foreground",
  draft: "bg-status-draft-surface text-status-foreground",
  danger: "bg-surface-status-red text-destructive",
};

/** A small rounded status label, e.g. "פעיל" on a campaign row. */
export function StatusChip({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}
