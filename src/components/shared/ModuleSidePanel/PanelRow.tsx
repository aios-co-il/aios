import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const VALUE_TONE = {
  plain: "text-foreground",
  danger: "text-destructive",
  success: "text-brand-accent-700 dark:text-brand-accent-400",
} as const;

/** What every panel row shows: an icon, a label and an optional figure. */
export interface PanelRowProps {
  icon: LucideIcon;
  label: string;
  /** A figure or count at the row's end; a corner badge when collapsed. */
  value?: ReactNode;
  tone?: keyof typeof VALUE_TONE;
  iconClassName?: string;
}

/** The row's icon, label and figure; collapsed, the figure moves to a badge. */
export function PanelRowContent({
  icon: Icon,
  label,
  value,
  tone = "plain",
  iconClassName,
  collapsed,
}: PanelRowProps & { collapsed: boolean }) {
  const hasValue = value !== undefined && value !== null;

  return (
    <>
      <Icon
        className={cn("h-4 w-4 shrink-0", iconClassName)}
        aria-hidden="true"
      />
      {collapsed ? (
        hasValue && (
          <span
            className={cn(
              "absolute end-0.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-card px-1 text-[10px] font-bold tabular-nums shadow-elevation-1",
              VALUE_TONE[tone],
            )}
          >
            {value}
          </span>
        )
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {hasValue && (
            <span
              className={cn(
                "shrink-0 text-xs font-bold tabular-nums",
                VALUE_TONE[tone],
              )}
            >
              {value}
            </span>
          )}
        </>
      )}
    </>
  );
}
