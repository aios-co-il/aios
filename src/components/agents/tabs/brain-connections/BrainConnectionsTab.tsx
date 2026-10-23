import { useState } from "react";
import {
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { groupLabel, type BrainRoute } from "@/lib/agentChannelRouting";
import { maskKey } from "@/lib/carmenBrainConnections";
import {
  RouteIcon,
  routeColor,
} from "@/components/carmen-command/BrainRouteIcon";
import { BuiltinKeyDialog } from "./BuiltinKeyDialog";
import { ModelBrainDialog } from "./ModelBrainDialog";
import {
  testBrainConnection,
  useBrainConnections,
  type BrainConnection,
  type BrainConnectionsState,
  type BuiltinBrainState,
} from "./useBrainConnections";

type Route = BrainConnectionsState["routes"][number];

function KeyBadge({
  route,
  connection,
  builtin,
}: {
  route: Route;
  connection?: BrainConnection;
  builtin?: BuiltinBrainState;
}) {
  if (route.route_type === "model") {
    return connection?.key_last4 ? (
      <Badge variant="secondary" dir="ltr">
        {maskKey(connection.key_last4)}
      </Badge>
    ) : (
      <Badge variant="destructive">חסר מפתח</Badge>
    );
  }
  if (!builtin) return null;
  if (builtin.key_last4)
    return (
      <Badge variant="secondary" dir="ltr">
        {maskKey(builtin.key_last4)}
      </Badge>
    );
  if (builtin.env_configured)
    return <Badge variant="outline">מסוד סביבה</Badge>;
  return <Badge variant="destructive">לא מוגדר</Badge>;
}

/**
 * Carmen settings → מוחות וחיבורים: every brain in one list. Managers connect
 * chat models, set keys for built-in brains, and choose what the picker shows.
 */
export function BrainConnectionsTab() {
  const { tenantId } = useCurrentTenant();
  const { data, isLoading, error, run, pending } = useBrainConnections(
    tenantId ?? null,
  );
  const [editing, setEditing] = useState<BrainConnection | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [builtinOpen, setBuiltinOpen] = useState<BuiltinBrainState | null>(
    null,
  );
  const [testingId, setTestingId] = useState<string | null>(null);

  if (!tenantId) return null;
  if (isLoading)
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (error)
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        <ShieldCheck className="mb-2 h-5 w-5" />
        {(error as Error).message.includes("owners")
          ? "רק בעלי החשבון יכולים לנהל את המוחות של כרמן."
          : `טעינת המוחות נכשלה: ${(error as Error).message}`}
      </Card>
    );

  const connections = data?.connections ?? [];
  const routes = data?.routes ?? [];
  const builtins = data?.builtins ?? [];
  const byConnection = new Map(connections.map((c) => [c.id, c]));
  const bySlug = new Map(builtins.map((b) => [b.slug, b]));
  const groups = routes.reduce<Record<string, Route[]>>((acc, r) => {
    (acc[r.route_type] ||= []).push(r);
    return acc;
  }, {});
  const order: BrainRoute["route_type"][] = [
    "model",
    "internal",
    "direct_channel",
    "parliament",
  ];

  const submit = (action: string, payload: Record<string, unknown>) =>
    run({
      action,
      payload,
      success:
        action === "create"
          ? "המוח חובר ונוסף לבורר"
          : action === "set_key"
            ? "המפתח נשמר"
            : "נשמר",
    });

  async function test(conn: BrainConnection) {
    setTestingId(conn.id);
    const res = await testBrainConnection(tenantId!, {
      connection_id: conn.id,
    });
    setTestingId(null);
    if (res.ok) toast.success(`${conn.name} עובד · ${res.reply ?? ""}`);
    else toast.error(`${conn.name}: ${res.error || "הבדיקה נכשלה"}`);
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">מוחות וחיבורים</h3>
          <p className="text-sm text-muted-foreground">
            כל המוחות של כרמן במקום אחד. המתג קובע אם המוח מופיע בבורר. מפתחות
            נשמרים מוצפנים ולא מוצגים שוב.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="me-1 h-4 w-4" />
          חיבור מוח
        </Button>
      </div>

      {order
        .filter((type) => groups[type]?.length)
        .map((type) => (
          <div key={type} className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              {groupLabel(type)}
            </div>
            {groups[type].map((r) => {
              const conn = r.connection_id
                ? byConnection.get(r.connection_id)
                : undefined;
              const builtin = bySlug.get(r.slug);
              const description = conn?.profile?.description;
              return (
                <Card key={r.id} className="p-3">
                  <div className="flex items-center gap-3">
                    <RouteIcon type={r.route_type} color={routeColor(r)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.label}</div>
                      <div
                        className="truncate text-xs text-muted-foreground"
                        dir={conn ? "ltr" : undefined}
                      >
                        {conn
                          ? `${conn.model} · ${conn.base_url}`
                          : description || r.slug}
                      </div>
                    </div>
                    <KeyBadge route={r} connection={conn} builtin={builtin} />
                    {conn && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="בדיקת חיבור"
                          disabled={testingId === conn.id}
                          onClick={() => test(conn)}
                        >
                          {testingId === conn.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Zap className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="עריכה"
                          onClick={() => {
                            setEditing(conn);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="מחיקה"
                          disabled={pending}
                          onClick={() => {
                            if (
                              confirm(
                                `למחוק את ${conn.name}? המפתח יימחק מה-Vault.`,
                              )
                            )
                              submit("delete", { connection_id: conn.id });
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                    {builtin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="מפתח"
                        onClick={() => setBuiltinOpen(builtin)}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                    )}
                    <Switch
                      checked={r.active}
                      disabled={pending}
                      aria-label="הצגה בבורר"
                      title={r.active ? "מופיע בבורר" : "מוסתר מהבורר"}
                      onCheckedChange={(active) =>
                        submit("set_visible", { route_id: r.id, active })
                      }
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        ))}

      <ModelBrainDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tenantId={tenantId}
        connection={editing}
        onSubmit={submit}
        pending={pending}
      />
      <BuiltinKeyDialog
        builtin={builtinOpen}
        onOpenChange={(open) => !open && setBuiltinOpen(null)}
        onSave={(payload) => submit("set_key", payload)}
        onReset={(slug) => submit("remove_key", { builtin_slug: slug })}
        pending={pending}
      />
    </div>
  );
}
