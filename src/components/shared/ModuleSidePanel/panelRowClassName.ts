import { cn } from "@/lib/utils";

/** The row box, centred on the icon while the panel is collapsed. */
export function panelRowClassName(collapsed: boolean): string {
  return cn(
    "relative flex h-8 w-full shrink-0 items-center gap-2 rounded-lg text-sm text-muted-foreground",
    collapsed ? "justify-center px-0" : "px-2 text-start",
  );
}

/** Hover and focus feedback for rows that act: buttons and links. */
export const PANEL_ROW_INTERACTIVE_CLASS =
  "transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A count worth a badge: zero shows nothing. */
export function badgeCount(count: number): number | undefined {
  return count > 0 ? count : undefined;
}
