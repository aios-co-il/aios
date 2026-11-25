import { useId, useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useModuleSidePanel } from "./moduleSidePanelContext";
import { ModuleSidePanelItem } from "./ModuleSidePanelItem";

/**
 * A titled group of panel controls. Controls that cannot shrink to an icon,
 * such as filter selects, pass `collapsedIcon`: while collapsed the group is
 * that one icon, and clicking it opens the panel. In the open panel the title
 * folds the group away, so long panels fit without scrolling.
 */
export function ModuleSidePanelSection({
  label,
  collapsedIcon,
  collapsedValue,
  defaultOpen = true,
  children,
}: {
  label: string;
  collapsedIcon?: LucideIcon;
  /** A count on the collapsed icon, such as active filters. */
  collapsedValue?: ReactNode;
  /** Whether the group starts unfolded in the open panel. */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { collapsed, expand } = useModuleSidePanel();
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  if (collapsed && collapsedIcon) {
    return (
      <div className="border-t pt-1.5 first:border-t-0 first:pt-0">
        <ModuleSidePanelItem
          icon={collapsedIcon}
          label={label}
          value={collapsedValue}
          onClick={expand}
        />
      </div>
    );
  }

  // The icon-only panel always shows its rows; folding is for the open panel.
  const showContent = collapsed || open;

  return (
    <section
      aria-label={label}
      className="flex flex-col gap-0.5 border-t pt-1.5 first:border-t-0 first:pt-0"
    >
      {!collapsed && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen(!open)}
          className="flex h-6 items-center justify-between rounded-md px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>{label}</span>
          <span className="flex items-center gap-1">
            {!open && collapsedValue !== undefined && (
              <span className="tabular-nums text-foreground">
                {collapsedValue}
              </span>
            )}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform motion-reduce:transition-none",
                !open && "rotate-90",
              )}
              aria-hidden="true"
            />
          </span>
        </button>
      )}
      {showContent && (
        <div id={contentId} className="flex flex-col gap-0.5">
          {children}
        </div>
      )}
    </section>
  );
}
