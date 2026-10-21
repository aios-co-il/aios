import { useState } from "react";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AgentSidebar,
  type AgentListItem,
} from "@/components/agents/AgentSidebar";
import { AgentEditor } from "@/components/agents/AgentEditor";
import { AgentHubMobileHeader } from "@/components/agents/AgentHubMobileHeader";
import { ConnectedAgentsDialog } from "@/components/agents/ConnectedAgentsDialog";
import { CreateAgentDialog } from "@/components/agents/CreateAgentDialog";
import { useAgentHubAgents } from "@/components/agents/useAgentHubAgents";
import { Button } from "@/components/ui/button";
import { Plug } from "lucide-react";

export default function AgentHub() {
  const { tenantId } = useCurrentTenant();
  const isMobile = useIsMobile();
  const { agents, selectedId, setSelectedId, selectedAgent } =
    useAgentHubAgents(tenantId);
  const [createOpen, setCreateOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [connectedOpen, setConnectedOpen] = useState(false);

  const list: AgentListItem[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
    active: a.active ?? true,
    engine: a.engine,
  }));

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (isMobile) setSheetOpen(false);
  };

  const handleCreate = () => {
    setCreateOpen(true);
    if (isMobile) setSheetOpen(false);
  };

  return (
    <div
      className="h-[calc(100vh-4rem)] flex flex-col md:flex-row overflow-hidden"
      dir="rtl"
    >
      {isMobile ? (
        <AgentHubMobileHeader
          agents={list}
          selectedId={selectedId}
          selectedName={selectedAgent?.name}
          sheetOpen={sheetOpen}
          onSheetOpenChange={setSheetOpen}
          onSelect={handleSelect}
          onCreate={handleCreate}
        />
      ) : (
        <AgentSidebar
          agents={list}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={() => setCreateOpen(true)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex justify-end border-b px-3 py-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setConnectedOpen(true)}
          >
            <Plug className="h-3.5 w-3.5" />
            סוכנים מחוברים
          </Button>
        </div>
        {selectedAgent ? (
          <AgentEditor key={selectedAgent.id} agent={selectedAgent} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground p-6 text-center">
            בחר סוכן מהרשימה או צור סוכן חדש
          </div>
        )}
      </div>

      <ConnectedAgentsDialog
        open={connectedOpen}
        onOpenChange={setConnectedOpen}
      />

      <CreateAgentDialog
        tenantId={tenantId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setSelectedId}
      />
    </div>
  );
}
