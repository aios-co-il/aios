import { Loader2 } from "lucide-react";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { ConnectedAgentCard } from "./ConnectedAgentCard";
import { ConnectedAgentProfileDialog } from "./ConnectedAgentProfileDialog";
import { useConnectedAgentRoutes } from "./useConnectedAgentRoutes";
import { useConnectedAgentProfileEditor } from "./useConnectedAgentProfileEditor";

// Profiles for connected (external) agents — Cursor, Grok, Claude, Codex… — kept in
// agent_brain_routes.config.profile, which is already tenant-scoped by RLS.

export function ConnectedAgentProfiles() {
  const { tenantId } = useCurrentTenant();
  const { data: routes = [], isLoading } = useConnectedAgentRoutes(tenantId);
  const editor = useConnectedAgentProfileEditor(tenantId);

  if (isLoading)
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (routes.length === 0)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        אין סוכנים מחוברים. חבר Cursor, Grok או Claude מחיבורי ה-MCP.
      </p>
    );

  return (
    <div className="space-y-3" dir="rtl">
      <div className="grid gap-3 md:grid-cols-2">
        {routes.map((r) => (
          <ConnectedAgentCard key={r.id} route={r} onEdit={editor.open} />
        ))}
      </div>

      <ConnectedAgentProfileDialog editor={editor} />
    </div>
  );
}
