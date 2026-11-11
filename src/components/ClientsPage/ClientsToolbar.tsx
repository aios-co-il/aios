import type { ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CLIENT_SERVICE_OPTIONS } from "@/components/clients/clientStatusMeta";
import type { ClientFilters } from "./clientFilters";
import {
  CampaignerFilterSelect,
  type CampaignerOption,
} from "./CampaignerFilterSelect";

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
  /** The view toggle, at the end of the bar. */
  children: ReactNode;
}

/** The white bar above the list: search, quick filters, more filters and the view toggle. */
export function ClientsToolbar({
  filters,
  onFilterChange,
  campaigners,
  showSearch,
  activeFilterCount,
  onOpenFilters,
  children,
}: ClientsToolbarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border bg-card p-2 shadow-elevation-1">
      {showSearch && (
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="חפש לקוח..."
            value={filters.search}
            onChange={(e) => onFilterChange("search", e.target.value)}
            className="h-9 border-transparent bg-surface-inset pr-9"
          />
        </div>
      )}
      {campaigners && (
        <CampaignerFilterSelect
          value={filters.campaigner}
          onChange={(v) => onFilterChange("campaigner", v)}
          campaigners={campaigners}
          triggerClassName="h-9 w-[150px]"
        />
      )}
      <Select
        value={filters.status}
        onValueChange={(v) => onFilterChange("status", v)}
      >
        <SelectTrigger className="h-9 w-[130px]">
          <SelectValue placeholder="סטטוס" />
        </SelectTrigger>
        <SelectContent className="bg-background">
          <ClientStatusFilterItems />
        </SelectContent>
      </Select>
      <Select
        value={filters.service}
        onValueChange={(v) => onFilterChange("service", v)}
      >
        <SelectTrigger className="h-9 w-[140px]">
          <SelectValue placeholder="סוג לקוח" />
        </SelectTrigger>
        <SelectContent className="bg-background">
          <SelectItem value="all">כל סוגי הלקוחות</SelectItem>
          <ClientServiceFilterItems />
        </SelectContent>
      </Select>
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
      <div className="ms-auto">{children}</div>
    </div>
  );
}

/** The status filter's items; "ended" reads "עזב" in filters, as it always has. */
export function ClientStatusFilterItems() {
  return (
    <>
      <SelectItem value="all">כל הסטטוסים</SelectItem>
      <SelectItem value="active">פעיל</SelectItem>
      <SelectItem value="onboarding">בקליטה</SelectItem>
      <SelectItem value="paused">מושהה</SelectItem>
      <SelectItem value="ended">עזב</SelectItem>
    </>
  );
}

/** The product-tag filter's items, without the "all" item (its label differs per place). */
export function ClientServiceFilterItems() {
  return (
    <>
      {CLIENT_SERVICE_OPTIONS.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </>
  );
}
