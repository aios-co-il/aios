import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { solidColorChipStyle } from "@/components/leads/softColorChip";
import { cn } from "@/lib/utils";
import type { LeadStageOption } from "./leadTableTypes";

/**
 * One pipeline column and its drop target: a header filled with the stage
 * colour the tenant chose, with the lead count, and a calm well that holds the
 * stage's cards.
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
          style={solidColorChipStyle(color)}
        >
          <span className="min-w-0 truncate text-sm font-bold">
            {stage.label}
          </span>
          {typeof leadCount === "number" && (
            <span
              className="shrink-0 rounded-full bg-black/20 px-2 py-0.5 text-xs font-semibold tabular-nums"
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
