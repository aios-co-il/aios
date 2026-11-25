import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CLIENT_SERVICE_OPTIONS } from "@/components/clients/clientStatusMeta";
import { cn } from "@/lib/utils";
import type { ClientFilters } from "./clientFilters";
import {
  CampaignerFilterSelect,
  type CampaignerOption,
} from "./CampaignerFilterSelect";

/**
 * The quick filters: campaigner, status and client type. Inline they sit in
 * the mobile toolbar row; stacked they fill the desktop side panel.
 */
export function ClientsFilterFields({
  filters,
  onFilterChange,
  campaigners,
  layout,
}: {
  filters: ClientFilters;
  onFilterChange: <K extends keyof ClientFilters>(
    key: K,
    value: ClientFilters[K],
  ) => void;
  /** Null hides the campaigner filter (only managers and owners get it). */
  campaigners: ReadonlyArray<CampaignerOption> | null;
  layout: "inline" | "stacked";
}) {
  const stacked = layout === "stacked";

  return (
    <>
      {campaigners && (
        <CampaignerFilterSelect
          value={filters.campaigner}
          onChange={(v) => onFilterChange("campaigner", v)}
          campaigners={campaigners}
          triggerClassName={stacked ? "h-9 w-full" : "h-9 w-[150px]"}
        />
      )}
      <Select
        value={filters.status}
        onValueChange={(v) => onFilterChange("status", v)}
      >
        <SelectTrigger className={cn("h-9", stacked ? "w-full" : "w-[130px]")}>
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
        <SelectTrigger className={cn("h-9", stacked ? "w-full" : "w-[140px]")}>
          <SelectValue placeholder="סוג לקוח" />
        </SelectTrigger>
        <SelectContent className="bg-background">
          <SelectItem value="all">כל סוגי הלקוחות</SelectItem>
          <ClientServiceFilterItems />
        </SelectContent>
      </Select>
    </>
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
