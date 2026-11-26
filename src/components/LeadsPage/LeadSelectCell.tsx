import type { ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

/** One choice of a select cell. */
export interface LeadSelectCellOption {
  value: string;
  label: string;
}

interface LeadSelectCellProps {
  value: string | undefined;
  options: ReadonlyArray<LeadSelectCellOption>;
  /** Names the field for the tooltip, e.g. "מקור הליד". */
  label: string;
  onSave: (next: string) => void;
  /** What the cell shows; clicking it opens the choices. */
  children: ReactNode;
}

/** A leads-table cell that picks one of a few values; choosing one saves it. */
export function LeadSelectCell({
  value,
  options,
  label,
  onSave,
  children,
}: LeadSelectCellProps) {
  return (
    <Select value={value} onValueChange={onSave}>
      <SelectTrigger
        title={`עריכת ${label}`}
        className="h-auto min-h-7 w-full gap-1 border-transparent bg-transparent px-1 py-0.5 text-start shadow-none hover:border-input"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="min-w-0 flex-1">{children}</span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
