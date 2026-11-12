import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CarmenPersona } from "./carmenPersonas";
import { PersonaLook } from "./PersonaLook";

interface PersonaCardProps {
  persona: CarmenPersona;
  selected: boolean;
  disabled: boolean;
  onChoose: () => void;
  onEdit: () => void;
}

/** One character in the picker: its look, name and call words. */
export function PersonaCard({
  persona,
  selected,
  disabled,
  onChoose,
  onEdit,
}: PersonaCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-shadow",
        selected && "ring-2 ring-primary",
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-disabled={disabled}
        onClick={() => !disabled && !selected && onChoose()}
        className="flex min-w-0 flex-1 items-center gap-3 text-start"
      >
        <PersonaLook look={persona.look} />
        <span className="min-w-0">
          <span className="flex items-center gap-1 font-semibold">
            {persona.displayName}
            {selected && <Check className="h-4 w-4 text-primary" />}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {persona.callWords.length > 0
              ? `נקרא: ${persona.callWords.join(", ")}`
              : "בלי מילת הפעלה"}
            {persona.ownerUserId && " · רק אצלי"}
          </span>
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`עריכת ${persona.displayName}`}
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
}
