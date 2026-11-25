import { LayoutGrid, MessageCircle, Table as TableIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** The three ways the Clients screen lays out its list. */
export type ClientsViewMode = "grid" | "table" | "chat";

/** The views, shared by the toolbar toggle and the side panel. */
export const CLIENT_VIEW_OPTIONS: ReadonlyArray<{
  value: ClientsViewMode;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "chat", label: "כרטיס לקוח", icon: MessageCircle },
  { value: "grid", label: "כרטיסים", icon: LayoutGrid },
  { value: "table", label: "טבלה", icon: TableIcon },
];
