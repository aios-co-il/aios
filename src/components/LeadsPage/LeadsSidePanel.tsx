import type { ReactNode } from "react";
import { Filter, Plus, Star, Users } from "lucide-react";

import { AddLeadForm } from "@/components/forms/AddLeadForm";
import { LEAD_VIEW_ICONS } from "@/components/leads/leadViewIcons";
import { LeadDefaultViewMenu } from "@/components/leads/LeadViewModeToggle";
import { ModuleSidePanel } from "@/components/shared/ModuleSidePanel/ModuleSidePanel";
import { ModuleSidePanelItem } from "@/components/shared/ModuleSidePanel/ModuleSidePanelItem";
import { ModuleSidePanelSection } from "@/components/shared/ModuleSidePanel/ModuleSidePanelSection";
import {
  LEAD_VIEW_MODE_LABELS,
  LEAD_VIEW_MODES,
  type LeadViewMode,
} from "@/lib/leadViewMode";
import type { LeadTableLayout } from "@/lib/leadTableLayout";
import {
  LeadsPanelFooter,
  LeadsPanelTools,
  type LeadsPanelToolsProps,
} from "./LeadsPanelActions";
import { LEAD_TABLE_LAYOUTS } from "./leadTableLayouts";

interface LeadsSidePanelProps extends LeadsPanelToolsProps {
  /** The count line, e.g. "מציג 50 מתוך 1,240 לידים". */
  subtitle: ReactNode;
  viewMode: LeadViewMode;
  defaultView: LeadViewMode | null;
  onViewModeChange: (mode: LeadViewMode) => void;
  onDefaultViewChange: (mode: LeadViewMode) => void;
  /** The headline figures as panel rows; omitted while there are none. */
  summary?: ReactNode;
  /** Saved filters and pipeline stages, stacked. */
  presets: ReactNode;
  hasActiveFilters: boolean;
  /** The table's layout, offered in the table view only. */
  tableLayout?: {
    value: LeadTableLayout;
    onChange: (layout: LeadTableLayout) => void;
  };
  onSyncFacebook: () => void;
  isSyncingFacebook: boolean;
}

/**
 * The desktop controls of the Leads screen as a side panel: title and count,
 * add lead, the views, the headline figures, filters, table and list tools,
 * and lead intake at the bottom.
 */
export function LeadsSidePanel({
  subtitle,
  viewMode,
  defaultView,
  onViewModeChange,
  onDefaultViewChange,
  summary,
  presets,
  hasActiveFilters,
  tableLayout,
  onSyncFacebook,
  isSyncingFacebook,
  ...tools
}: LeadsSidePanelProps) {
  return (
    <ModuleSidePanel
      module="leads"
      icon={Users}
      title="לידים"
      subtitle={subtitle}
      footer={
        <LeadsPanelFooter
          onSyncFacebook={onSyncFacebook}
          isSyncingFacebook={isSyncingFacebook}
        />
      }
    >
      <AddLeadForm
        trigger={<ModuleSidePanelItem primary icon={Plus} label="הוסף ליד" />}
      />
      <ModuleSidePanelSection label="תצוגה">
        {LEAD_VIEW_MODES.map((mode) => (
          <ModuleSidePanelItem
            key={mode}
            icon={LEAD_VIEW_ICONS[mode]}
            label={LEAD_VIEW_MODE_LABELS[mode]}
            active={viewMode === mode}
            onClick={() => onViewModeChange(mode)}
          />
        ))}
        <LeadDefaultViewMenu
          viewMode={viewMode}
          defaultView={defaultView}
          onDefaultViewChange={onDefaultViewChange}
          trigger={
            <ModuleSidePanelItem
              icon={Star}
              iconClassName={
                defaultView === viewMode ? "fill-current" : undefined
              }
              label="תצוגת ברירת מחדל"
            />
          }
        />
      </ModuleSidePanelSection>
      {summary && (
        <ModuleSidePanelSection label="סיכום" defaultOpen={false}>
          {summary}
        </ModuleSidePanelSection>
      )}
      <ModuleSidePanelSection
        label="פילטרים"
        collapsedIcon={Filter}
        collapsedValue={hasActiveFilters ? "✓" : undefined}
      >
        {presets}
      </ModuleSidePanelSection>
      {tableLayout && (
        <ModuleSidePanelSection label="פריסת טבלה" defaultOpen={false}>
          {LEAD_TABLE_LAYOUTS.map((layout) => (
            <ModuleSidePanelItem
              key={layout.value}
              icon={layout.icon}
              label={layout.label}
              title={layout.title}
              active={tableLayout.value === layout.value}
              onClick={() => tableLayout.onChange(layout.value)}
            />
          ))}
        </ModuleSidePanelSection>
      )}
      <ModuleSidePanelSection label="כלים" defaultOpen={false}>
        <LeadsPanelTools {...tools} />
      </ModuleSidePanelSection>
    </ModuleSidePanel>
  );
}
