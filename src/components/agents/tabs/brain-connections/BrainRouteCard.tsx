import { KeyRound, Loader2, Pencil, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  RouteIcon,
  routeColor,
} from "@/components/carmen-command/BrainRouteIcon";
import type {
  BrainConnection,
  BrainRouteSummary,
  BuiltinBrainState,
} from "../../../../../supabase/functions/_shared/carmen/brain-connections/types.ts";

/** One brain in the settings list: key status, actions, picker switch. */
export function BrainRouteCard({
  route,
  connection,
  builtin,
  busy,
  testing,
  onActive,
  onTest,
  onEdit,
  onDelete,
  onKey,
}: {
  route: BrainRouteSummary;
  connection?: BrainConnection;
  builtin?: BuiltinBrainState;
  busy: boolean;
  testing: boolean;
  onActive: (active: boolean) => void;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onKey: () => void;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <RouteIcon type={route.route_type} color={routeColor(route)} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{route.label}</div>
          <div
            className="truncate text-xs text-muted-foreground"
            dir={connection ? "ltr" : undefined}
          >
            {connection
              ? `${connection.model} · ${connection.base_url}`
              : routeDescription(route)}
          </div>
        </div>
        <KeyBadge connection={connection} builtin={builtin} />
        {connection && (
          <>
            <IconButton title="בדיקת חיבור" disabled={testing} onClick={onTest}>
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
            </IconButton>
            <IconButton title="עריכה" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton title="מחיקה" disabled={busy} onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </IconButton>
          </>
        )}
        {builtin && (
          <IconButton title="מפתח" onClick={onKey}>
            <KeyRound className="h-4 w-4" />
          </IconButton>
        )}
        <Switch
          checked={route.active}
          disabled={busy}
          aria-label="מופיע בבורר"
          title={route.active ? "מופיע בבורר" : "מוסתר מהבורר"}
          onCheckedChange={onActive}
        />
      </div>
    </Card>
  );
}

function IconButton(props: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return <Button variant="ghost" size="icon" {...props} />;
}

/** Last 4 of a saved key, "from env", or what is missing. */
function KeyBadge({
  connection,
  builtin,
}: {
  connection?: BrainConnection;
  builtin?: BuiltinBrainState;
}) {
  const last4 = connection?.key_last4 ?? builtin?.key_last4;
  if (last4)
    return (
      <Badge variant="secondary" dir="ltr">
        ••••{last4}
      </Badge>
    );
  if (connection) return <Badge variant="destructive">חסר מפתח</Badge>;
  if (!builtin) return null;
  return builtin.env_configured ? (
    <Badge variant="outline">מסוד סביבה</Badge>
  ) : (
    <Badge variant="destructive">לא מוגדר</Badge>
  );
}

/** The route's own description (e.g. "נתב חכם"), else its slug. */
function routeDescription(route: BrainRouteSummary): string {
  const d = route.config.description;
  return typeof d === "string" && d ? d : route.slug;
}
