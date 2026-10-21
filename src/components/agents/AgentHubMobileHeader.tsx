import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  AgentSidebar,
  type AgentListItem,
} from "@/components/agents/AgentSidebar";

export function AgentHubMobileHeader({
  agents,
  selectedId,
  selectedName,
  sheetOpen,
  onSheetOpenChange,
  onSelect,
  onCreate,
}: {
  agents: AgentListItem[];
  selectedId: string | null;
  selectedName?: string | null;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 border-b bg-card shrink-0">
      <Sheet open={sheetOpen} onOpenChange={onSheetOpenChange}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Menu className="h-4 w-4" />
            סוכנים
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="p-0 w-72 max-w-[85vw]">
          <AgentSidebar
            agents={agents}
            selectedId={selectedId}
            onSelect={onSelect}
            onCreate={onCreate}
          />
        </SheetContent>
      </Sheet>
      <div className="text-sm font-medium truncate">
        {selectedName || "בחר סוכן"}
      </div>
    </div>
  );
}
