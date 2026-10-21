import type { BroadcastList } from "@/hooks/useBroadcastLists";
import { Badge } from "@/components/ui/badge";
import { Filter, RefreshCw, Zap } from "lucide-react";

/** Source / sync badges on a mailing-list card. */
export function ListBadges({ list }: { list: BroadcastList }) {
  return (
    <div className="flex flex-wrap gap-1">
      {list.source === "crm_filter" && (
        <Badge variant="outline" className="text-xs">
          <Filter className="ml-1 h-3 w-3" />
          {list.source_config?.source === "clients" ? "לקוחות" : "לידים"} לפי
          סינון
        </Badge>
      )}
      {(list.source_config?.auto_sync ||
        list.source_config?.sync_automation_id) && (
        <Badge variant="secondary" className="text-xs">
          <Zap className="ml-1 h-3 w-3" />
          מסונכרנת
        </Badge>
      )}
      {list.kind === "dynamic" && (
        <Badge variant="secondary" className="text-xs">
          <RefreshCw className="ml-1 h-3 w-3" />
          {list.source === "crm_filter" ? "דינמית" : "מסונכרן"}
        </Badge>
      )}
      {list.source === "google_sheet" && (
        <Badge variant="outline" className="text-xs">
          Google Sheet
        </Badge>
      )}
    </div>
  );
}
