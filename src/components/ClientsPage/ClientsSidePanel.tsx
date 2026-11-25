import type { ReactNode } from "react";
import { SlidersHorizontal, Users } from "lucide-react";

import { ModuleSidePanel } from "@/components/shared/ModuleSidePanel/ModuleSidePanel";
import { ModuleSidePanelItem } from "@/components/shared/ModuleSidePanel/ModuleSidePanelItem";
import { ModuleSidePanelSection } from "@/components/shared/ModuleSidePanel/ModuleSidePanelSection";
import type { ClientFilters } from "./clientFilters";
import type { CampaignerOption } from "./CampaignerFilterSelect";
import { ClientsFilterFields } from "./ClientsFilterFields";
import {
  CLIENT_VIEW_OPTIONS,
  type ClientsViewMode,
} from "./clientsViewOptions";

interface ClientsSidePanelProps {
  /** Undefined while the list is loading. */
  shownCount: number | undefined;
  viewMode: ClientsViewMode;
  onViewModeChange: (mode: ClientsViewMode) => void;
  filters: ClientFilters;
  onFilterChange: <K extends keyof ClientFilters>(
    key: K,
    value: ClientFilters[K],
  ) => void;
  /** Null hides the campaigner filter (only managers and owners get it). */
  campaigners: ReadonlyArray<CampaignerOption> | null;
  activeFilterCount: number;
  onOpenFilters: () => void;
  /** The headline figures as panel rows; omitted while there are none. */
  kpis?: ReactNode;
  /** Import / export and other secondary actions, at the bottom. */
  footer: ReactNode;
}

/**
 * The desktop controls of the Clients screen as a side panel: title and
 * count, the views, the headline figures, the filters and import / export.
 */
export function ClientsSidePanel({
  shownCount,
  viewMode,
  onViewModeChange,
  filters,
  onFilterChange,
  campaigners,
  activeFilterCount,
  onOpenFilters,
  kpis,
  footer,
}: ClientsSidePanelProps) {
  const filtersCount = activeFilterCount > 0 ? activeFilterCount : undefined;

  return (
    <ModuleSidePanel
      module="clients"
      icon={Users}
      title="לקוחות"
      subtitle={shownCount === undefined ? undefined : `${shownCount} מוצגים`}
      footer={footer}
    >
      <ModuleSidePanelSection label="תצוגה">
        {CLIENT_VIEW_OPTIONS.map(({ value, label, icon }) => (
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
        <div className="flex flex-col gap-1.5">
          <ClientsFilterFields
            filters={filters}
            onFilterChange={onFilterChange}
            campaigners={campaigners}
            layout="stacked"
          />
        </div>
        <ModuleSidePanelItem
          icon={SlidersHorizontal}
          label="סינון מתקדם"
          value={filtersCount}
          onClick={onOpenFilters}
        />
      </ModuleSidePanelSection>
      {kpis && (
        <ModuleSidePanelSection label="סיכום">{kpis}</ModuleSidePanelSection>
      )}
    </ModuleSidePanel>
  );
}
