import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";
import { useModuleSidePanel } from "./moduleSidePanelContext";
import { PanelRowContent, type PanelRowProps } from "./PanelRow";
import {
  PANEL_ROW_INTERACTIVE_CLASS,
  panelRowClassName,
} from "./panelRowClassName";
import { PanelTooltip } from "./PanelTooltip";

export interface ModuleSidePanelItemProps
  extends PanelRowProps, Omit<ComponentPropsWithoutRef<"button">, "value"> {
  /** Marks the selected option in a group, such as the current view. */
  active?: boolean;
  /** Fills the row in the brand colour: the screen's main action. */
  primary?: boolean;
}

/**
 * One action in the side panel: icon and label, or the icon alone with a
 * tooltip while collapsed. It forwards its ref and props so a dialog or menu
 * can use it as a trigger.
 */
export const ModuleSidePanelItem = forwardRef<
  HTMLButtonElement,
  ModuleSidePanelItemProps
>(function ModuleSidePanelItem(
  {
    icon,
    label,
    value,
    tone,
    active,
    primary,
    iconClassName,
    className,
    title,
    ...buttonProps
  },
  ref,
) {
  const { collapsed } = useModuleSidePanel();

  return (
    <PanelTooltip label={title ?? label} enabled={collapsed}>
      <button
        ref={ref}
        type="button"
        aria-label={collapsed ? label : undefined}
        aria-pressed={active}
        title={collapsed ? undefined : title}
        className={cn(
          panelRowClassName(collapsed),
          PANEL_ROW_INTERACTIVE_CLASS,
          "disabled:pointer-events-none disabled:opacity-50",
          active &&
            "bg-surface-inset font-semibold text-foreground shadow-elevation-1",
          primary &&
            "bg-primary font-semibold text-primary-foreground shadow-elevation-1 hover:bg-primary/90 hover:text-primary-foreground",
          className,
        )}
        {...buttonProps}
      >
        <PanelRowContent
          icon={icon}
          label={label}
          value={value}
          tone={tone}
          collapsed={collapsed}
          iconClassName={cn(
            active && "text-brand-accent-700 dark:text-brand-accent-400",
            iconClassName,
          )}
        />
      </button>
    </PanelTooltip>
  );
});
