import { LayoutGrid, MessageCircle, Table as TableIcon } from "lucide-react";

import type { LeadViewMode } from "@/lib/leadViewMode";

/** One icon per leads view, shared by the toggle and the side panel. */
export const LEAD_VIEW_ICONS: Record<LeadViewMode, typeof LayoutGrid> = {
  kanban: LayoutGrid,
  table: TableIcon,
  chat: MessageCircle,
};
