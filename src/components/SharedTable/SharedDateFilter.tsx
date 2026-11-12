import { useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SHARED_TABLE_DATE_FILTERS } from "@/lib/dashboardDateFilters";
import { cn } from "@/lib/utils";
import type { SharedDateSelection } from "./useSharedTableData";

type Props = {
  value: SharedDateSelection;
  onChange: (value: SharedDateSelection) => void;
};

/** The share link's report window: the shared presets or a custom range. */
export function SharedDateFilter({ value, onChange }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [start, setStart] = useState<Date | undefined>(value.customStart);
  const [end, setEnd] = useState<Date | undefined>(value.customEnd);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 min-w-[180px] justify-between"
        >
          <CalendarIcon className="h-4 w-4" />
          <span>{selectionLabel(value)}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 bg-background z-[100]">
        {SHARED_TABLE_DATE_FILTERS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange({ filter: option.value })}
            className={cn(
              "cursor-pointer",
              value.filter === option.value && "bg-accent font-medium",
            )}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
          <Popover open={customOpen} onOpenChange={setCustomOpen}>
            <PopoverTrigger asChild>
              <button className="w-full text-right px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer">
                טווח מותאם אישית...
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-0 z-[100] bg-background"
              align="start"
              side="bottom"
            >
              <div className="p-3 space-y-3">
                <div className="flex gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">מתאריך</Label>
                    <Calendar
                      mode="single"
                      selected={start}
                      onSelect={setStart}
                      disabled={(date) =>
                        date > new Date() || (!!end && date > end)
                      }
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">עד תאריך</Label>
                    <Calendar
                      mode="single"
                      selected={end}
                      onSelect={setEnd}
                      disabled={(date) =>
                        date > new Date() || (!!start && date < start)
                      }
                      className="p-3 pointer-events-auto"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCustomOpen(false)}
                  >
                    ביטול
                  </Button>
                  <Button
                    size="sm"
                    disabled={!start || !end}
                    onClick={() => {
                      onChange({
                        filter: "custom",
                        customStart: start,
                        customEnd: end,
                      });
                      setCustomOpen(false);
                    }}
                  >
                    החל
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The trigger's text: the custom days or the preset's name. */
function selectionLabel(value: SharedDateSelection): string {
  if (value.filter === "custom" && value.customStart && value.customEnd) {
    return `${shortDay(value.customStart)} - ${shortDay(value.customEnd)}`;
  }
  return (
    SHARED_TABLE_DATE_FILTERS.find((option) => option.value === value.filter)
      ?.label || "בחר טווח"
  );
}

/** A day as dd/MM/yy. */
function shortDay(date: Date): string {
  return format(date, "dd/MM/yy", { locale: he });
}
