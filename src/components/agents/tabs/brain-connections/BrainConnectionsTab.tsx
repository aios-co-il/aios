import { useState } from "react";
import { Loader2, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { groupLabel } from "@/lib/agentChannelRouting";
import type {
  BrainConnection,
  BrainRouteSummary,
  BrainRouteType,
  BuiltinBrainState,
} from "../../../../../supabase/functions/_shared/carmen/brain-connections/types.ts";
import { BrainRouteCard } from "./BrainRouteCard";
import { BuiltinKeyDialog } from "./BuiltinKeyDialog";
import { ModelBrainDialog } from "./ModelBrainDialog";
import {
  useBrainConnections,
  useTestBrainConnection,
} from "./useBrainConnections";

const GROUP_ORDER: BrainRouteType[] = [
  "model",
  "internal",
  "direct_channel",
  "parliament",
];

/**
 * Carmen settings → מוחות וחיבורים: every brain in one list. Owners connect
 * chat models, set keys for built-in brains, and choose what the picker shows.
 */
export function BrainConnectionsTab() {
  const { tenantId } = useCurrentTenant();
  const { data, isLoading, error, write } = useBrainConnections(
    tenantId ?? null,
  );
  const test = useTestBrainConnection(tenantId ?? null);
  const [modelDialog, setModelDialog] = useState<{
    conn: BrainConnection | null;
  } | null>(null);
  const [keyDialog, setKeyDialog] = useState<BuiltinBrainState | null>(null);

  if (!tenantId) return null;
  if (isLoading)
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (error || !data)
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        <ShieldCheck className="mb-2 h-5 w-5" />
        {error?.message.includes("owners")
          ? "רק בעלי החשבון יכולים לנהל את המוחות של כרמן."
          : `טעינת המוחות נכשלה: ${error?.message ?? ""}`}
      </Card>
    );

  const connections = new Map(data.connections.map((c) => [c.id, c]));
  const builtins = new Map(data.builtins.map((b) => [b.slug, b]));
  const byType = (type: BrainRouteType) =>
    data.routes.filter((r) => r.route_type === type);
  const card = (r: BrainRouteSummary) => {
    const conn = r.connection_id ? connections.get(r.connection_id) : undefined;
    return (
      <BrainRouteCard
        key={r.id}
        route={r}
        connection={conn}
        builtin={builtins.get(r.slug)}
        busy={write.isPending}
        testing={test.isPending && test.variables?.connection_id === conn?.id}
        onActive={(active) =>
          write.mutate({
            action: "set_active",
            payload: { route_id: r.id, active },
          })
        }
        onTest={() => conn && test.mutate({ connection_id: conn.id })}
        onEdit={() => conn && setModelDialog({ conn })}
        onDelete={() => {
          if (conn && confirm(`למחוק את ${conn.name}? המפתח יימחק מה-Vault.`))
            write.mutate({
              action: "delete",
              payload: { connection_id: conn.id },
              success: "נמחק",
            });
        }}
        onKey={() => setKeyDialog(builtins.get(r.slug) ?? null)}
      />
    );
  };

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
        <Button size="sm" onClick={() => setModelDialog({ conn: null })}>
          <Plus className="me-1 h-4 w-4" />
          חיבור מוח
        </Button>
      </div>
      {GROUP_ORDER.filter((t) => byType(t).length).map((type) => (
        <div key={type} className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            {groupLabel(type)}
          </div>
          {byType(type).map(card)}
        </div>
      ))}
      {modelDialog && (
        <ModelBrainDialog
          tenantId={tenantId}
          connection={modelDialog.conn}
          write={write}
          onClose={() => setModelDialog(null)}
        />
      )}
      {keyDialog && (
        <BuiltinKeyDialog
          builtin={keyDialog}
          write={write}
          onClose={() => setKeyDialog(null)}
        />
      )}
    </div>
  );
}
