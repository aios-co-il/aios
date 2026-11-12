import { cn } from "@/lib/utils";
import type { CarmenAvatarStyle } from "@/hooks/useCarmenAvatarStyle";
import { PersonaLook } from "./PersonaLook";

const LOOKS: Array<{ look: CarmenAvatarStyle; label: string }> = [
  { look: "orbs", label: "ספירה" },
  { look: "minime", label: "Mini Me" },
  { look: "character", label: "דמות מאוירת" },
];
const HEADING_ID = "persona-look-heading";

/** Picks a character's look. */
export function PersonaLookPicker({
  look,
  onChange,
}: {
  look: CarmenAvatarStyle;
  onChange: (look: CarmenAvatarStyle) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p id={HEADING_ID} className="text-sm font-medium">
        מראה
      </p>
      <div
        role="radiogroup"
        aria-labelledby={HEADING_ID}
        className="flex gap-3"
      >
        {LOOKS.map((option) => (
          <button
            key={option.look}
            type="button"
            role="radio"
            aria-checked={option.look === look}
            onClick={() => onChange(option.look)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border bg-background p-3",
              option.look === look && "ring-2 ring-primary",
            )}
          >
            <PersonaLook look={option.look} />
            <span className="text-xs font-medium">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
