import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TeamOption } from "./userListTypes";

const NONE = "none";

/** Links a user to one team card (campaigner or sales person), or to none. */
export function TeamMemberSelect({
  value,
  label,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: string | null;
  label: string | undefined;
  options: Array<TeamOption>;
  onChange: (id: string | null) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Select
      value={value || NONE}
      onValueChange={(next) => onChange(next === NONE ? null : next)}
    >
      <SelectTrigger className={cn("h-8", className)} aria-label={ariaLabel}>
        <SelectValue>
          {label || <span className="text-muted-foreground">-</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-background z-50">
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">ללא שיוך</span>
        </SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
