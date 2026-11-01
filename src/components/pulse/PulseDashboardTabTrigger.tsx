import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TabsTrigger } from "@/components/ui/tabs";
import type { PulseDashboardTab } from "./pulseDashboardTabs";

/** One pulse dashboard tab, with a count badge while its count is above zero. */
export function PulseDashboardTabTrigger({
  value,
  icon: Icon,
  label,
  count = 0,
}: {
  value: PulseDashboardTab;
  icon: LucideIcon;
  label: string;
  count?: number;
}) {
  return (
    <TabsTrigger value={value} className="gap-2">
      <Icon className="h-4 w-4" />
      {label}
      {count > 0 ? (
        <Badge variant="secondary" className="mr-1 text-[10px] px-1.5 py-0">
          {count}
        </Badge>
      ) : null}
    </TabsTrigger>
  );
}
