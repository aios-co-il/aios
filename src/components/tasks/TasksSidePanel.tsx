import type { ReactNode } from "react";
import {
  CalendarDays,
  ListChecks,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { ModuleSidePanel } from "@/components/shared/ModuleSidePanel/ModuleSidePanel";
import { ModuleSidePanelItem } from "@/components/shared/ModuleSidePanel/ModuleSidePanelItem";
import { badgeCount } from "@/components/shared/ModuleSidePanel/panelRowClassName";
import { ModuleSidePanelSection } from "@/components/shared/ModuleSidePanel/ModuleSidePanelSection";
import { TasksPanelPeriodNav } from "./TasksPanelPeriodNav";
import { TASK_VIEWS } from "./taskViews";
import { tasksPeriodLabel } from "./tasksPeriodLabel";
import type { ViewMode } from "./WeeklyTaskBoard";

interface TasksSidePanelProps {
  viewMode: ViewMode;
  onViewModeChange: (value: string) => void;
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** The chat view's search box, shown in place of the period navigation. */
  chatSearch: ReactNode;
  /** The quick filters, laid out in a column. */
  toolbarFilters: ReactNode;
  activeFiltersCount: number;
  onOpenFilters: () => void;
  /** The headline figures, as panel rows. */
  summary: ReactNode;
  calendar: {
    connected: boolean;
    syncing: boolean;
    connecting: boolean;
    onSync: () => void;
    onConnect: () => void;
  };
}

/**
 * The desktop controls of the Tasks screen as a side panel: title and period,
 * navigation or chat search, the views, filters, the headline figures and
 * calendar sync at the bottom.
 */
export function TasksSidePanel({
  viewMode,
  onViewModeChange,
  currentDate,
  onPrev,
  onNext,
  onToday,
  chatSearch,
  toolbarFilters,
  activeFiltersCount,
  onOpenFilters,
  summary,
  calendar,
}: TasksSidePanelProps) {
  const isCalendarView = viewMode !== "chat";
  const filtersCount = badgeCount(activeFiltersCount);

  return (
    <ModuleSidePanel
      module="tasks"
      icon={ListChecks}
      title="משימות"
      subtitle={
        isCalendarView ? tasksPeriodLabel(viewMode, currentDate) : undefined
      }
      footer={isCalendarView && <CalendarAction {...calendar} />}
    >
      {isCalendarView ? (
        <ModuleSidePanelSection label="ניווט">
          <TasksPanelPeriodNav
            onPrev={onPrev}
            onNext={onNext}
            onToday={onToday}
          />
        </ModuleSidePanelSection>
      ) : (
        <ModuleSidePanelSection label="חיפוש" collapsedIcon={Search}>
          {chatSearch}
        </ModuleSidePanelSection>
      )}
      <ModuleSidePanelSection label="תצוגה">
        {TASK_VIEWS.map(({ value, label, icon }) => (
          <ModuleSidePanelItem
            key={value}
            icon={icon}
            label={label}
            active={viewMode === value}
            onClick={() => onViewModeChange(value)}
          />
        ))}
      </ModuleSidePanelSection>
      <ModuleSidePanelSection
        label="פילטרים"
        collapsedIcon={SlidersHorizontal}
        collapsedValue={filtersCount}
      >
        {toolbarFilters}
        <ModuleSidePanelItem
          icon={SlidersHorizontal}
          label="מתקדם"
          value={filtersCount}
          onClick={onOpenFilters}
        />
      </ModuleSidePanelSection>
      <ModuleSidePanelSection label="סיכום" defaultOpen={false}>
        {summary}
      </ModuleSidePanelSection>
    </ModuleSidePanel>
  );
}

/** Sync to the connected calendar, or connect one. */
function CalendarAction({
  connected,
  syncing,
  connecting,
  onSync,
  onConnect,
}: TasksSidePanelProps["calendar"]) {
  if (connected) {
    return (
      <ModuleSidePanelItem
        icon={RefreshCw}
        iconClassName={syncing ? "animate-spin" : undefined}
        label="סנכרן"
        onClick={onSync}
        disabled={syncing}
      />
    );
  }

  return (
    <ModuleSidePanelItem
      icon={CalendarDays}
      iconClassName={connecting ? "animate-pulse" : undefined}
      label={connecting ? "מתחבר..." : "חבר יומן"}
      onClick={onConnect}
      disabled={connecting}
    />
  );
}
