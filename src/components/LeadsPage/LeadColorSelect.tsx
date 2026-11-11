import { Settings2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { softColorChipStyle } from "@/components/leads/softColorChip";
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
 * An inline stage or status picker drawn as a soft chip in the chosen colour,
 * with a colour dot per option and a shortcut to manage the list.
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
        style={softColorChipStyle(current?.color)}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {current?.color && <ColorDot color={current.color} />}
          <span className="truncate">{current?.label ?? placeholder}</span>
        </span>
      </SelectTrigger>
      <SelectContent className="z-50 bg-popover">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              {option.color ? (
                <ColorDot color={option.color} />
              ) : (
                <span className="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/40" />
              )}
              {option.label}
            </span>
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

/** The chosen colour as a small solid dot. */
function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}
