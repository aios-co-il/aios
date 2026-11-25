import { useMemo, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModuleSidePanelContext } from "./moduleSidePanelContext";
import { PanelTooltip } from "./PanelTooltip";
import { useModuleSidePanelState } from "./useModuleSidePanelState";

interface ModuleSidePanelProps {
  /** Names the remembered open/collapsed state, one per screen. */
  module: string;
  icon: LucideIcon;
  title: string;
  /** A short line under the title, such as the period or the shown count. */
  subtitle?: ReactNode;
  /** Sections, from top to bottom. */
  children: ReactNode;
  /** Actions pinned to the bottom, such as sync or import. */
  footer?: ReactNode;
}

/**
 * A screen's filters, figures and secondary actions as a vertical panel at
 * the left edge of the module, beside its main content. It starts collapsed
 * to icons, pushes the content when opened, and hides below `md`, where each
 * screen keeps its own mobile header.
 */
export function ModuleSidePanel({
  module,
  icon: Icon,
  title,
  subtitle,
  children,
  footer,
}: ModuleSidePanelProps) {
  const [collapsed, setCollapsed] = useModuleSidePanelState(module);
  const state = useMemo(
    () => ({ collapsed, expand: () => setCollapsed(false) }),
    [collapsed, setCollapsed],
  );
  const toggleLabel = collapsed ? "פתח את הפאנל" : "כווץ את הפאנל";

  return (
    <ModuleSidePanelContext.Provider value={state}>
      <aside
        aria-label={title}
        data-collapsed={collapsed}
        className={cn(
          "hidden shrink-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-elevation-1 transition-[width] duration-200 ease-linear motion-reduce:transition-none md:flex",
          collapsed ? "w-14" : "w-60",
        )}
      >
        <header
          className={cn(
            "flex shrink-0 items-center gap-2 border-b p-2",
            collapsed && "flex-col",
          )}
        >
          <PanelTooltip label={title} enabled={collapsed}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-accent-100 text-brand-accent-800 dark:bg-brand-accent-900 dark:text-brand-accent-200">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          </PanelTooltip>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold leading-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="truncate text-xs text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
          )}
          <PanelTooltip label={toggleLabel} enabled={collapsed}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              title={collapsed ? undefined : toggleLabel}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </PanelTooltip>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden p-2">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 flex-col gap-0.5 border-t p-1.5">
            {footer}
          </div>
        )}
      </aside>
    </ModuleSidePanelContext.Provider>
  );
}
