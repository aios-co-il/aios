import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientFilters } from "./clientFilters";
import type { CampaignerOption } from "./CampaignerFilterSelect";
import { ClientsFilterFields } from "./ClientsFilterFields";
import { ClientsSearchInput } from "./ClientsSearchInput";

interface ClientsToolbarProps {
  filters: ClientFilters;
  onFilterChange: <K extends keyof ClientFilters>(
    key: K,
    value: ClientFilters[K],
  ) => void;
  /** Null hides the campaigner filter (only managers and owners get it). */
  campaigners: ReadonlyArray<CampaignerOption> | null;
  /** The chat view has its own search, so the toolbar hides it there. */
  showSearch: boolean;
  activeFilterCount: number;
  onOpenFilters: () => void;
  /** The title, at the start of the bar. */
  leading: ReactNode;
  /** The view toggle and page actions, at the end of the bar. */
  children: ReactNode;
}

/**
 * The one white bar above the list on phones: title, search, quick filters,
 * more filters, then the view toggle and page actions. Desktop uses the side
 * panel instead.
 */
export function ClientsToolbar({
  filters,
  onFilterChange,
  campaigners,
  showSearch,
  activeFilterCount,
  onOpenFilters,
  leading,
  children,
}: ClientsToolbarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border bg-card p-2 shadow-elevation-1">
      {leading}
      {showSearch && (
        <ClientsSearchInput
          value={filters.search}
          onChange={(value) => onFilterChange("search", value)}
          className="min-w-[200px] flex-1 sm:max-w-xs"
        />
      )}
      <ClientsFilterFields
        filters={filters}
        onFilterChange={onFilterChange}
        campaigners={campaigners}
        layout="inline"
      />
      <Button
        variant="outline"
        className="relative h-9 gap-2"
        onClick={onOpenFilters}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden sm:inline">סינון</span>
        {activeFilterCount > 0 && (
          <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-accent px-1 text-[11px] font-bold text-brand-ink">
            {activeFilterCount}
          </span>
        )}
      </Button>
      <div className="ms-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
