import {
  WORKSHOP_MODE_LABEL,
  WORKSHOP_MODES,
  type WorkshopMode,
} from "../../../supabase/functions/_shared/workshop/workshop-mode.ts";
import { useWorkshopMode } from "./useWorkshopMode";

/** What each mode means, under the buttons' titles. */
const MODE_HINT: Record<WorkshopMode, string> = {
  semi: "כרמן עוצרת לאישור שלך בכל שלב",
  auto: "כרמן עושה הכול לבד; רק התקציב מחכה לאישור שלך",
};

interface WorkshopModeToggleProps {
  tenantId: string | null | undefined;
  projectId: string;
}

/**
 * The workshop chat's automatic / semi-automatic switch for the open project. The choice is stored
 * on the project (workshop_set_mode) and Carmen follows it from the next message.
 */
export function WorkshopModeToggle({
  tenantId,
  projectId,
}: WorkshopModeToggleProps) {
  const { mode, loading, saving, setMode } = useWorkshopMode(
    tenantId,
    projectId,
  );
  return (
    <div
      role="group"
      aria-label="מצב עבודה של כרמן"
      className="flex w-full items-center gap-2 text-xs"
    >
      <span className="shrink-0 text-[var(--cc-text-dim)]">מצב עבודה:</span>
      <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg border border-[var(--cc-line)] p-0.5">
        {WORKSHOP_MODES.map((option) => (
          <button
            key={option}
            type="button"
            title={MODE_HINT[option]}
            aria-pressed={mode === option}
            disabled={loading || saving}
            onClick={() => {
              if (option !== mode) {
                setMode(option);
              }
            }}
            className={`h-7 rounded-md px-2 transition-colors disabled:opacity-60 ${
              mode === option
                ? "bg-[rgba(76,195,255,0.18)] font-medium text-[var(--cc-accent)]"
                : "text-[var(--cc-text-dim)] hover:text-[var(--cc-text)]"
            }`}
          >
            {WORKSHOP_MODE_LABEL[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
