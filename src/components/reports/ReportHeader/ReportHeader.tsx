import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ReportHeaderProps = {
  title: ReactNode;
  onBack: () => void;
  /** Small labels beside the title, such as the connected platforms. */
  badges?: ReactNode;
  /** Small text after the title: client, agency, freshness, sync warning. */
  meta?: ReactNode;
  /** Buttons at the end of the first row: client card, accounts, share. */
  actions?: ReactNode;
  /** The view tabs at the start of the second row. */
  tabs?: ReactNode;
  /** Controls at the end of the second row: dates, previous period. */
  controls?: ReactNode;
};

/**
 * Shrinks every control in a header row to the height of a tab, including
 * the triggers that dialogs such as the share dialog render themselves.
 */
const COMPACT_CONTROLS =
  "[&_button]:h-8 [&_button.w-10]:w-8 [&_button]:text-xs [&_input]:h-8 [&_input]:text-xs";

/**
 * The report and dashboard header in two thin rows (David, 2026-11-11): the
 * title row with its actions, then the tabs row with the date controls.
 */
export function ReportHeader({
  title,
  onBack,
  badges,
  meta,
  actions,
  tabs,
  controls,
}: ReportHeaderProps) {
  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-9">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="חזרה"
            title="חזרה"
            onClick={onBack}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold leading-tight">{title}</h1>
          {badges}
          {meta && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              {meta}
            </div>
          )}
        </div>
        {actions && (
          <div
            className={cn(
              "ms-auto flex flex-wrap items-center gap-1.5",
              COMPACT_CONTROLS,
            )}
          >
            {actions}
          </div>
        )}
      </div>
      {(tabs || controls) && (
        <div className="flex flex-wrap items-center gap-2 min-h-9">
          {tabs && <div className="min-w-0 max-lg:w-full">{tabs}</div>}
          {controls && (
            <div
              className={cn(
                "ms-auto flex flex-wrap items-center gap-1.5",
                COMPACT_CONTROLS,
              )}
            >
              {controls}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
