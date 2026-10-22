import { UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MemberBrainGrid } from "./MemberBrainGrid";
import type { AccessPatch, AccessRow, Route } from "./types";

type Member = { id: string; full_name?: string | null; email?: string | null };

/** One team member: unrestricted by default, or a permissions row to edit. */
export function MemberPermissionsCard({
  member,
  row,
  routes,
  disabled,
  onSave,
}: {
  member: Member;
  row: AccessRow | undefined;
  routes: Route[];
  disabled: boolean;
  onSave: (patch: AccessPatch | null) => void;
}) {
  const status = row
    ? row.enabled
      ? "הרשאות מוגדרות"
      : "אין גישה לכרמן"
    : "ללא הגבלה (ברירת מחדל)";
  return (
    <Card className="space-y-3 p-3 text-right">
      <div className="flex items-center gap-2">
        <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {member.full_name || member.email}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{status}</p>
        </div>
        {row ? (
          <>
            <label className="flex items-center gap-2 text-xs">
              גישה לכרמן
              <Switch
                checked={row.enabled}
                disabled={disabled}
                onCheckedChange={(v) => onSave({ enabled: v })}
              />
            </label>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={disabled}
              onClick={() => onSave(null)}
            >
              הסר הגבלות
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={disabled}
            onClick={() => onSave({})}
          >
            הגדרת הרשאות
          </Button>
        )}
      </div>
      {row?.enabled && (
        <MemberBrainGrid
          row={row}
          routes={routes}
          disabled={disabled}
          onPatch={onSave}
        />
      )}
    </Card>
  );
}
