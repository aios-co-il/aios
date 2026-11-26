import {
  CalendarDays,
  CalendarRange,
  LayoutGrid,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

import type { ViewMode } from "./WeeklyTaskBoard";

/** The Tasks views, shared by the mobile switcher and the side panel. */
export const TASK_VIEWS: Array<{
  value: ViewMode;
  label: string;
  ariaLabel: string;
  icon: LucideIcon;
}> = [
  {
    value: "chat",
    label: "צ'אט",
    ariaLabel: "תצוגת צ'אט",
    icon: MessageSquare,
  },
  {
    value: "daily",
    label: "יומי",
    ariaLabel: "תצוגה יומית",
    icon: CalendarDays,
  },
  {
    value: "weekly",
    label: "שבועי",
    ariaLabel: "תצוגה שבועית",
    icon: LayoutGrid,
  },
  {
    value: "monthly",
    label: "חודשי",
    ariaLabel: "תצוגה חודשית",
    icon: CalendarRange,
  },
];
