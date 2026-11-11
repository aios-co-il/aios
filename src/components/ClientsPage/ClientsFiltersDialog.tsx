import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ClientMoodOptions } from "@/components/clients/ClientStatusOptions";
import type { ClientFilters } from "./clientFilters";
import {
  ClientServiceFilterItems,
  ClientStatusFilterItems,
} from "./ClientsToolbar";
import {
  CampaignerFilterSelect,
  type CampaignerOption,
} from "./CampaignerFilterSelect";

interface ClientsFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ClientFilters;
  onFilterChange: <K extends keyof ClientFilters>(
    key: K,
    value: ClientFilters[K],
  ) => void;
  /** Null hides the campaigner filter. */
  campaigners: ReadonlyArray<CampaignerOption> | null;
  activeFilterCount: number;
  onClearAll: () => void;
}

/** Every list filter in one dialog, opened from the toolbar's "סינון" button. */
export function ClientsFiltersDialog({
  open,
  onOpenChange,
  filters,
  onFilterChange,
  campaigners,
  activeFilterCount,
  onClearAll,
}: ClientsFiltersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
            סינון לקוחות
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {campaigners && (
            <FilterField label="קמפיינר">
              <CampaignerFilterSelect
                value={filters.campaigner}
                onChange={(v) => onFilterChange("campaigner", v)}
                campaigners={campaigners}
                triggerClassName="w-full"
              />
            </FilterField>
          )}
          <FilterField label="מצב לקוח">
            <Select
              value={filters.mood}
              onValueChange={(v) => onFilterChange("mood", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="כל המצבים" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="all">כל המצבים</SelectItem>
                <ClientMoodOptions />
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="מוצר / שירות">
            <Select
              value={filters.service}
              onValueChange={(v) => onFilterChange("service", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="all">כל המוצרים</SelectItem>
                <ClientServiceFilterItems />
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="סטטוס לקוח">
            <Select
              value={filters.status}
              onValueChange={(v) => onFilterChange("status", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <ClientStatusFilterItems />
              </SelectContent>
            </Select>
          </FilterField>
          <div className="flex items-center justify-between rounded-xl bg-surface-inset px-3 py-2.5">
            <Label htmlFor="hide-inactive-dialog" className="cursor-pointer">
              הסתר לא פעילים
            </Label>
            <Switch
              id="hide-inactive-dialog"
              checked={filters.hideInactive}
              onCheckedChange={(v) => onFilterChange("hideInactive", v)}
            />
          </div>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={onClearAll}
            >
              נקה את כל הפילטרים
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A labelled row in the filters dialog. */
function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
