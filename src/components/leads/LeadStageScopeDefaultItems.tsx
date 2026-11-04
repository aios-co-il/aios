import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LEAD_STAGE_SCOPES,
  LEAD_STAGE_SCOPE_LABELS,
  type LeadStageScope,
} from "./leadStageScope";

interface LeadStageScopeDefaultItemsProps {
  /** The saved scope the screen opens on, or null when none is saved. */
  defaultStageScope: LeadStageScope | null;
  onChange: (scope: LeadStageScope) => void;
}

/** Pipeline-menu items that save which leads the screen opens on. */
export function LeadStageScopeDefaultItems({
  defaultStageScope,
  onChange,
}: LeadStageScopeDefaultItemsProps) {
  return (
    <>
      <DropdownMenuSeparator className="my-1" />
      <DropdownMenuLabel className="px-2 py-1 text-xs text-muted-foreground">
        ברירת מחדל בפתיחה
      </DropdownMenuLabel>
      {LEAD_STAGE_SCOPES.map((scope) => {
        const isDefault = defaultStageScope === scope;
        return (
          <DropdownMenuItem
            key={scope}
            onClick={() => onChange(scope)}
            className="justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <Star
                className={cn("h-3.5 w-3.5", isDefault && "fill-current")}
              />
              {LEAD_STAGE_SCOPE_LABELS[scope]}
            </span>
            {isDefault && <Check className="h-4 w-4 shrink-0" />}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}
