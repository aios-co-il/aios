import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STATUS_TONE_CLASS, type StatusTone } from "./statusTone";

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
        STATUS_TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}
