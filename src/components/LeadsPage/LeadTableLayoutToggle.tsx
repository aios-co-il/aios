import { Calendar as CalendarIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LeadTableLayout } from "@/lib/leadTableLayout";
import { cn } from "@/lib/utils";

const LAYOUTS: ReadonlyArray<{
  value: LeadTableLayout;
  label: string;
  title: string;
  icon: typeof Users;
}> = [
  {
    value: "by_user",
    label: "לפי משתמשים",
    title: "לפי משתמשים במשטח",
    icon: Users,
  },
  {
    value: "by_date",
    label: "לפי תאריך",
    title: "טבלה אחת לפי תאריך",
    icon: CalendarIcon,
  },
];

/** Switches the table between one table per user and one table by date. */
export function LeadTableLayoutToggle({
  value,
  onChange,
}: {
  value: LeadTableLayout;
  onChange: (layout: LeadTableLayout) => void;
}) {
  return (
    <div className="flex shrink-0 gap-0.5 rounded-xl bg-muted p-1">
      {LAYOUTS.map((layout) => {
        const active = value === layout.value;
        const Icon = layout.icon;
        return (
          <Button
            key={layout.value}
            variant="ghost"
            size="sm"
            onClick={() => onChange(layout.value)}
            title={layout.title}
            aria-pressed={active}
            className={cn(
              "h-7 gap-1.5 rounded-lg px-2.5 text-muted-foreground hover:bg-card/70 hover:text-foreground",
              active &&
                "bg-card text-foreground shadow-elevation-1 hover:bg-card",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden text-xs font-medium sm:inline">
              {layout.label}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
