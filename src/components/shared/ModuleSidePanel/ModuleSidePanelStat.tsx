import { useModuleSidePanel } from "./moduleSidePanelContext";
import { PanelRowContent, type PanelRowProps } from "./PanelRow";
import { panelRowClassName } from "./panelRowClassName";
import { PanelTooltip } from "./PanelTooltip";

/**
 * A headline figure in the side panel: icon, label and value, or the icon
 * with the value as a badge while collapsed. `title` explains it on hover.
 */
export function ModuleSidePanelStat({
  title,
  ...row
}: PanelRowProps & { value: string | number; title?: string }) {
  const { collapsed } = useModuleSidePanel();

  return (
    <PanelTooltip label={title ?? row.label} enabled={collapsed}>
      <div
        // Focusable while collapsed so keyboard users can reach the tooltip.
        tabIndex={collapsed ? 0 : undefined}
        aria-label={collapsed ? `${row.label}: ${row.value}` : undefined}
        title={collapsed ? undefined : title}
        className={panelRowClassName(collapsed)}
      >
        <PanelRowContent {...row} collapsed={collapsed} />
      </div>
    </PanelTooltip>
  );
}
