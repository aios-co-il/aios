import { Settings2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { solidColorChipStyle } from "@/components/leads/softColorChip";
import { cn } from "@/lib/utils";

/** One choice in a stage or status select, in the colour the tenant chose. */
export interface LeadColorOption {
  value: string;
  label: string;
  color?: string | null;
}

interface LeadColorSelectProps {
  value: string | undefined;
  options: ReadonlyArray<LeadColorOption>;
  /** What the chip shows; null shows the placeholder. */
  current: { label: string; color?: string | null } | null;
  placeholder: string;
  onValueChange: (value: string) => void;
  manageLabel: string;
  onManage: () => void;
  /** Control the menu, e.g. to close it before a manage dialog opens. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * An inline stage or status picker drawn as a chip filled with the chosen
 * colour, each option in its own colour, and a shortcut to manage the list.
 */
export function LeadColorSelect({
  value,
  options,
  current,
  placeholder,
  onValueChange,
  manageLabel,
  onManage,
  open,
  onOpenChange,
}: LeadColorSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      open={open}
      onOpenChange={onOpenChange}
    >
      <SelectTrigger
        className={cn(
          "h-7 w-full gap-1.5 rounded-full px-2.5 text-xs font-medium shadow-none",
          current ? "text-foreground" : "border-dashed text-muted-foreground",
        )}
        style={solidColorChipStyle(current?.color)}
      >
        <span className="truncate">{current?.label ?? placeholder}</span>
      </SelectTrigger>
      <SelectContent className="z-50 bg-popover">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="my-0.5"
            style={solidColorChipStyle(option.color)}
          >
            {option.label}
          </SelectItem>
        ))}
        <div className="mt-1 border-t pt-1">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onManage();
            }}
          >
            <Settings2 className="h-4 w-4" />
            {manageLabel}
          </button>
        </div>
      </SelectContent>
    </Select>
  );
}
