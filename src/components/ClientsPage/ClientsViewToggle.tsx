import { LayoutGrid, MessageCircle, Table as TableIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The three ways the Clients screen lays out its list. */
export type ClientsViewMode = "grid" | "table" | "chat";

const VIEW_OPTIONS: ReadonlyArray<{
  value: ClientsViewMode;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "chat", label: "כרטיס לקוח", icon: MessageCircle },
  { value: "grid", label: "כרטיסים", icon: LayoutGrid },
  { value: "table", label: "טבלה", icon: TableIcon },
];

/** A segmented control for the list layout; labels collapse to icons on small screens. */
export function ClientsViewToggle({
  value,
  onChange,
}: {
  value: ClientsViewMode;
  onChange: (mode: ClientsViewMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="תצוגה"
      className="flex shrink-0 items-center gap-0.5 rounded-xl bg-surface-inset p-1"
    >
      {VIEW_OPTIONS.map(({ value: mode, label, icon: Icon }) => {
        const selected = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
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
