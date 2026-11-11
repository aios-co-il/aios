import {
  CalendarDays,
  CalendarRange,
  LayoutGrid,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { ViewMode } from "./WeeklyTaskBoard";

const VIEWS: Array<{
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

/**
 * The Tasks views as one segmented control: the selected view sits on a
 * raised white segment. `iconsOnly` keeps it narrow in the mobile sheet.
 */
export function TasksViewSwitcher({
  value,
  onChange,
  iconsOnly = false,
}: {
  value: ViewMode;
  onChange: (value: string) => void;
  iconsOnly?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={onChange}
      className="gap-0.5 rounded-xl bg-muted p-1"
    >
      {VIEWS.map(({ value: view, label, ariaLabel, icon: Icon }) => (
        <ToggleGroupItem
          key={view}
          value={view}
          aria-label={ariaLabel}
          title={ariaLabel}
          className={cn(
            "h-8 gap-1.5 rounded-lg text-muted-foreground hover:bg-card/60 hover:text-foreground",
            "data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-elevation-1",
            iconsOnly ? "px-2" : "px-3",
          )}
        >
          <Icon className="h-4 w-4" />
          {!iconsOnly && <span>{label}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
