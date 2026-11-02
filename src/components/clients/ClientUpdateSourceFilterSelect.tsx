import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLIENT_UPDATE_SOURCE_FILTERS,
  isClientUpdateSourceFilter,
  type ClientUpdateSourceFilter,
} from "@/components/clients/clientUpdateSource";

/** Filters the client card history by who wrote each entry. */
export function ClientUpdateSourceFilterSelect({
  value,
  onChange,
}: {
  value: ClientUpdateSourceFilter;
  onChange: (value: ClientUpdateSourceFilter) => void;
}) {
  return (
    <div className="w-full sm:w-44">
      <Label className="text-xs text-muted-foreground mb-1 block">
        סינון לפי מקור
      </Label>
      <Select
        value={value}
        onValueChange={(next) => {
          if (isClientUpdateSourceFilter(next)) {
            onChange(next);
          }
        }}
      >
        <SelectTrigger
          className="h-8 text-sm bg-card"
          aria-label="סינון לפי מקור"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CLIENT_UPDATE_SOURCE_FILTERS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
