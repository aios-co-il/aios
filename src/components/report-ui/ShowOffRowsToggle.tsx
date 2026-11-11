import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import {
  ADS_ENTITY_LEVEL_LABELS,
  type AdsEntityLevel,
} from "@/lib/adsEntityLevel";

interface ShowOffRowsToggleProps {
  level: AdsEntityLevel;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** "הצג קמפיינים כבויים": shows or hides the switched-off rows of a report table. */
export function ShowOffRowsToggle({
  level,
  checked,
  onCheckedChange,
}: ShowOffRowsToggleProps) {
  // Per instance: a report can show several tables with the same level.
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      הצג {ADS_ENTITY_LEVEL_LABELS[level]} כבויים
    </label>
  );
}
