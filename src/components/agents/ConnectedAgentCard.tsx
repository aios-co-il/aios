import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConnectedAgentAvatar } from "./ConnectedAgentAvatar";
import { readProfile, type RouteRow } from "./connectedAgentProfile";

export function ConnectedAgentCard({
  route: r,
  onEdit,
}: {
  route: RouteRow;
  onEdit: (r: RouteRow) => void;
}) {
  const p = readProfile(r.config);
  return (
    <Card className="space-y-2 p-4 text-right">
      <div className="flex items-center gap-3">
        <ConnectedAgentAvatar route={r} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{p.displayName || r.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {p.persona || "אין פרופיל עדיין"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs"
          onClick={() => onEdit(r)}
        >
          <Pencil className="h-3 w-3" />
          {p.persona || p.instructions || p.avatarPath
            ? "עריכת פרופיל"
            : "יצירת פרופיל"}
        </Button>
      </div>
      {p.instructions && (
        <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
          {p.instructions}
        </p>
      )}
    </Card>
  );
}
