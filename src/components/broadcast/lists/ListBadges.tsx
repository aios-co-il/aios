import type { BroadcastList } from "@/hooks/useBroadcastLists";
import { listKind } from "@/lib/broadcastListKind";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Filter, RefreshCw, Zap } from "lucide-react";

/** Source / sync badges on a mailing-list card. */
export function ListBadges({ list }: { list: BroadcastList }) {
  const kind = listKind(list);
  return (
    <div className="flex flex-wrap gap-1">
      {list.source === "crm_filter" && (
        <Badge variant="outline" className="text-xs">
          <Filter className="ml-1 h-3 w-3" />
          {list.source_config?.source === "clients" ? "לקוחות" : "לידים"} לפי
          סינון
        </Badge>
      )}
      {kind === "synced" &&
        (list.last_sync_error ? (
          <Badge
            variant="outline"
            className="border-amber-500 text-xs text-amber-700"
            title={`הסנכרון נכשל: ${list.last_sync_error}`}
          >
            <AlertTriangle className="ml-1 h-3 w-3" />
            מסונכרנת · שגיאת סנכרון
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">
            <Zap className="ml-1 h-3 w-3" />
            מסונכרנת
          </Badge>
        ))}
      {kind === "dynamic" && (
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
