import { cn } from "@/lib/utils";
import {
  CLIENT_VIEW_OPTIONS,
  type ClientsViewMode,
} from "./clientsViewOptions";

export type { ClientsViewMode } from "./clientsViewOptions";

/**
 * A segmented control for the list layout; labels collapse to icons on small
 * screens. Toggle buttons (aria-pressed), so Tab and Enter work as for any
 * button without radio-group arrow keys.
 */
export function ClientsViewToggle({
  value,
  onChange,
}: {
  value: ClientsViewMode;
  onChange: (mode: ClientsViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="תצוגה"
      className="flex shrink-0 items-center gap-0.5 rounded-xl bg-surface-inset p-1"
    >
      {CLIENT_VIEW_OPTIONS.map(({ value: mode, label, icon: Icon }) => {
        const selected = value === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={selected}
            title={label}
            onClick={() => onChange(mode)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-card text-foreground shadow-elevation-1"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4",
                selected && "text-brand-accent-700 dark:text-brand-accent-400",
              )}
            />
            <span className="hidden xl:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
