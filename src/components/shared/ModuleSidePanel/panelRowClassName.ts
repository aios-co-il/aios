import { cn } from "@/lib/utils";

/** The row box, centred on the icon while the panel is collapsed. */
export function panelRowClassName(collapsed: boolean): string {
  return cn(
    "relative flex h-8 w-full shrink-0 items-center gap-2 rounded-lg text-sm text-muted-foreground",
    collapsed ? "justify-center px-0" : "px-2 text-start",
  );
}
