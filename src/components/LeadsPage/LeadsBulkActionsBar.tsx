import { Archive, CheckSquare, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LeadStageOption } from "./leadTableTypes";

interface LeadsBulkActionsBarProps {
  selectedCount: number;
  /** Every lead matching the filter is selected, not only this page. */
  allSelected: boolean;
  stages: ReadonlyArray<LeadStageOption>;
  onClear: () => void;
  onChangeStage: (stageId: string) => void;
  onAssign: () => void;
  onArchive: () => void;
  /** Offered when the whole page is selected and more leads match. */
  selectAll: {
    totalCount: number | undefined;
    isLoading: boolean;
    onSelect: () => void;
  } | null;
}

/** Actions on the selected leads: change stage, assign, archive. */
export function LeadsBulkActionsBar({
  selectedCount,
  allSelected,
  stages,
  onClear,
  onChangeStage,
  onAssign,
  onArchive,
  selectAll,
}: LeadsBulkActionsBarProps) {
  return (
    <div className="m-2 flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-brand-accent-200 bg-brand-accent-50 px-3 py-2 text-foreground shadow-elevation-1 dark:border-brand-accent-800 dark:bg-brand-accent-950">
      <div className="flex items-center gap-2">
        <CheckSquare className="h-4 w-4 text-brand-accent-700 dark:text-brand-accent-300" />
        <span className="text-sm font-semibold">
          {selectedCount} לידים נבחרו
        </span>
        {allSelected && (
          <span className="rounded-full bg-brand-accent-200 px-2 py-0.5 text-xs font-medium dark:bg-brand-accent-800">
            כל הלידים
          </span>
        )}
        {selectAll && (
          <Button
            variant="link"
            size="sm"
            onClick={selectAll.onSelect}
            disabled={selectAll.isLoading}
            className="h-7 px-1 text-brand-accent-800 dark:text-brand-accent-200"
          >
            {selectAll.isLoading
              ? "טוען..."
              : `בחר את כל ${selectAll.totalCount?.toLocaleString()} הלידים`}
          </Button>
        )}
      </div>
      <div className="ms-auto flex flex-wrap items-center gap-2">
        <Select onValueChange={onChangeStage}>
          <SelectTrigger className="h-8 w-[170px] rounded-xl bg-card">
            <SelectValue placeholder="שנה שלב" />
          </SelectTrigger>
          <SelectContent className="z-50 bg-popover">
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: stage.hexColor }}
                    aria-hidden="true"
                  />
                  {stage.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={onAssign}
          className="h-8 gap-1.5 rounded-xl bg-card"
        >
          <User className="h-4 w-4" />
          שייך לאנשי מכירות
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onArchive}
          className="h-8 gap-1.5 rounded-xl border-destructive/40 bg-card text-destructive hover:bg-surface-status-red hover:text-destructive"
        >
          <Archive className="h-4 w-4" />
          לארכיון
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="h-8 w-8 rounded-full"
          title="נקה בחירה"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
