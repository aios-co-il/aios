import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ListTodo } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantPath } from "@/hooks/useTenantPath";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TasksTab } from "@/components/agents/tabs/TasksTab";
import { useCarmenAgent } from "./CarmenSettingsSheet";
import type { CommandCenterViewMode } from "@/pages/CarmenCommandCenter";

/** Header "▾ משימות" menu: every kind of Carmen task in one place. */
export function CarmenTasksMenu({
  tenantId,
  viewMode,
  onViewModeChange,
}: {
  tenantId: string | null;
  viewMode: CommandCenterViewMode;
  onViewModeChange: (mode: CommandCenterViewMode) => void;
}) {
  const { buildPath } = useTenantPath();
  const { data: agent } = useCarmenAgent(tenantId);
  const [tasksOpen, setTasksOpen] = useState(false);

  const { data: running = 0 } = useQuery({
    queryKey: ["carmen-running-tasks", tenantId],
    enabled: !!tenantId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("agent_tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!)
        .eq("status", "running");
      return count ?? 0;
    },
  });

  const item = (mode: CommandCenterViewMode, label: string) => (
    <DropdownMenuItem
      onSelect={() => onViewModeChange(mode)}
      className={viewMode === mode ? "bg-accent font-medium" : ""}
    >
      {label}
    </DropdownMenuItem>
  );

  return (
    <>
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="משימות"
            className="cc-header-btn flex items-center gap-1 rounded-md border border-[var(--cc-line)] px-2 text-xs text-[var(--cc-text-dim)] hover:border-[var(--cc-line-strong)] hover:text-[var(--cc-text)]"
          >
            <ListTodo className="h-4 w-4" />
            <span className="hidden sm:inline">משימות</span>
            {running > 0 && (
              <span className="rounded-full bg-[var(--cc-accent)] px-1.5 text-[10px] font-bold text-black">
                {running}
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="z-[100] w-60">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            משימות כרמן
          </DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!agent}
            onSelect={() => setTasksOpen(true)}
          >
            חד-פעמיות, חוזרות ומתוזמנות
            {running > 0 && (
              <span className="ms-auto text-xs text-muted-foreground">
                {running} רצות
              </span>
            )}
          </DropdownMenuItem>
          {item("goals", "יעדים")}
          {item("dev_tasks", "משימות פיתוח (Claude / Cursor)")}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            תצוגה
          </DropdownMenuLabel>
          {item("agents", "צ׳אט")}
          {item("dashboard", "לוח בקרה")}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to={buildPath("/agent-tasks")}>כל המשימות במסך מלא</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={tasksOpen} onOpenChange={setTasksOpen}>
        <SheetContent
          side="left"
          dir="rtl"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <SheetHeader className="border-b p-4 text-right">
            <SheetTitle>משימות כרמן</SheetTitle>
            <SheetDescription>
              חד-פעמיות, חוזרות ומתוזמנות. לכל משימה אפשר לבחור מתי היא רצה.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {agent && <TasksTab agent={agent} />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
