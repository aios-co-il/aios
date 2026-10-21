import type { ReactNode } from "react";

/** Rounded on/off chip used to pick lead statuses / sources. */
export function ToggleChip({
  active,
  onToggle,
  children,
}: {
  active: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-full border px-2 py-0.5 text-xs ${active ? "bg-primary text-primary-foreground" : ""}`}
    >
      {children}
    </button>
  );
}
