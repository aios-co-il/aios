import { useState, type ReactNode } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  COMBINED_DASHBOARD_DATE_FILTERS,
  type DateFilterOption,
} from "@/lib/dashboardDateFilters";

type DateRange = { from?: Date; to?: Date };

type DashboardDateControlsProps = {
  dateFilter: string;
  onDateFilterChange: (value: string) => void;
  /** The presets offered; the signed-in dashboard's, with a custom range, by default. */
  filters?: ReadonlyArray<DateFilterOption>;
  /** The custom range and its setter; a list without "custom" needs neither. */
  customDateRange?: DateRange;
  onCustomDateRangeChange?: (range: DateRange) => void;
  /** Shown before the dates, such as an organization's agency picker. */
  agencyPicker?: ReactNode;
  /** Shown after the dates, such as the previous-period button. */
  children?: ReactNode;
};

/** The dashboard's date range: a preset, or a custom range from a calendar. */
export function DashboardDateControls({
  dateFilter,
  onDateFilterChange,
  filters = COMBINED_DASHBOARD_DATE_FILTERS,
  customDateRange = {},
  onCustomDateRangeChange,
  agencyPicker,
  children,
}: DashboardDateControlsProps) {
  const isMobile = useIsMobile();
  const [calendarOpen, setCalendarOpen] = useState(false);
  return (
    <>
      {agencyPicker}
      <Select
        value={dateFilter}
        onValueChange={(value) => {
          onDateFilterChange(value);
          if (value === "custom") {
            setCalendarOpen(true);
          }
        }}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {filters.map((filter) => (
            <SelectItem key={filter.value} value={filter.value}>
              {filter.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {dateFilter === "custom" && onCustomDateRangeChange && (
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              <CalendarIcon className="h-4 w-4" />
              {customDateRange.from && customDateRange.to
                ? `${formatDay(customDateRange.from)} - ${formatDay(customDateRange.to)}`
                : "בחר תאריכים"}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0 pointer-events-auto"
            align="start"
          >
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={customDateRange.from}
              selected={{ from: customDateRange.from, to: customDateRange.to }}
              onSelect={(range: DateRange | undefined) => {
                onCustomDateRangeChange({ from: range?.from, to: range?.to });
                if (range?.from && range?.to) {
                  setCalendarOpen(false);
                }
              }}
              numberOfMonths={isMobile ? 1 : 2}
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      )}
      {children}
    </>
  );
}

/** A day as dd/MM/yyyy. */
function formatDay(day: Date): string {
  return format(day, "dd/MM/yyyy", { locale: he });
}
