import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface PickerOption {
  id: string;
  label: string;
}

/**
 * A small searchable picker on a backlog card (client or campaigner): a pill
 * that shows the current choice and opens a list with a "none" row first.
 */
export function BacklogInlinePicker({
  icon,
  selectedId,
  options,
  fallbackLabel,
  noneLabel,
  searchPlaceholder,
  onSelect,
}: {
  icon: ReactNode;
  selectedId: string | null;
  options: Array<PickerOption>;
  /** Shown when the selected id is not in the list. */
  fallbackLabel: string;
  noneLabel: string;
  searchPlaceholder: string;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = selectedId
    ? options.find((option) => option.id === selectedId)?.label || fallbackLabel
    : noneLabel;

  function choose(id: string | null) {
    onSelect(id);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex h-6 w-[120px] items-center gap-1 truncate rounded-full border bg-background px-2 text-[11px] hover:bg-muted",
            !selectedId && "text-muted-foreground",
          )}
        >
          {icon}
          <span className="truncate">{selectedLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-50 w-[200px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-8 text-xs"
          />
          <CommandList>
            <CommandEmpty>לא נמצא</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => choose(null)}>
                <CheckMark shown={!selectedId} />
                {noneLabel}
              </CommandItem>
              {options.map((option) => (
                <CommandItem key={option.id} onSelect={() => choose(option.id)}>
                  <CheckMark shown={selectedId === option.id} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** The tick beside the chosen row; hidden rows keep its space for alignment. */
function CheckMark({ shown }: { shown: boolean }) {
  return (
    <Check
      className={cn("mr-1 h-3 w-3", shown ? "opacity-100" : "opacity-0")}
    />
  );
}
