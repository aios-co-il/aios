import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { softColorChipStyle } from "@/components/leads/softColorChip";
import { cn } from "@/lib/utils";
import type { LeadStageOption } from "./leadTableTypes";

/**
 * One pipeline column and its drop target: a header in the stage colour with
 * the lead count, and a calm well that holds the stage's cards.
 */
export function LeadsKanbanStage({
  stage,
  leadCount,
  children,
}: {
  stage: LeadStageOption & { color?: string };
  leadCount?: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const color = stage.hexColor || stage.color;

  return (
    <div className="flex min-h-[600px] flex-col">
      <div
        ref={setNodeRef}
        className={cn(
          "relative rounded-2xl transition-shadow",
          isOver && "ring-2 ring-brand-accent-400 ring-offset-2",
        )}
      >
        <div
          className="flex items-center justify-between gap-2 rounded-t-2xl border border-b-0 bg-card px-3 py-2.5 shadow-elevation-1"
          style={{ borderTopColor: color, borderTopWidth: 3 }}
        >
          <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <span className="truncate">{stage.label}</span>
          </span>
          {typeof leadCount === "number" && (
            <span
              className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground"
              style={softColorChipStyle(color)}
              title={`${leadCount.toLocaleString()} לידים`}
            >
              {leadCount.toLocaleString()}
              <span className="sr-only"> לידים</span>
            </span>
          )}
        </div>
        <div className="min-h-[550px] flex-1 space-y-3 rounded-b-2xl border border-t-0 bg-muted/50 p-3">
          {children}
        </div>
      </div>
    </div>
  );
}
