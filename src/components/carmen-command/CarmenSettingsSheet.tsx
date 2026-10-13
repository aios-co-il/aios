import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenantPath } from "@/hooks/useTenantPath";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrainSelector } from "@/components/agents/BrainSelector";
import { ProfileTab } from "@/components/agents/tabs/ProfileTab";
import { GoalsTab } from "@/components/agents/tabs/GoalsTab";
import { ToolsTab } from "@/components/agents/tabs/ToolsTab";
import { KnowledgeTab } from "@/components/agents/tabs/KnowledgeTab";
import { MemoryTab } from "@/components/agents/tabs/MemoryTab";
import { CostTab } from "@/components/agents/tabs/CostTab";
import { ApprovalsTab } from "@/components/agents/tabs/ApprovalsTab";
import { UserProfilesTab } from "@/components/agents/tabs/UserProfilesTab";
import { ToolRegistryTab } from "@/components/agents/tabs/ToolRegistryTab";
import { RunsTab } from "@/components/agents/tabs/RunsTab";
import { SupervisorTab } from "@/components/agents/tabs/SupervisorTab";
import { McpConnectionsTab } from "@/components/agents/tabs/McpConnectionsTab";
import { EvalsTab } from "@/components/agents/tabs/EvalsTab";
import { AgentAccessTab } from "@/components/agents/tabs/AgentAccessTab";
import { CarmenConversationAccessTab } from "@/components/agents/tabs/CarmenConversationAccessTab";
import { AgentLearningTab } from "@/components/agents/tabs/AgentLearningTab";
import SkinsManager from "@/pages/SkinsManager";

export type CarmenSettingsSection =
  | "identity"
  | "brain"
  | "skins"
  | "knowledge"
  | "tools"
  | "whatsapp"
  | "phones"
  | "agents"
  | "approvals"
  | "system"
  | "costs";

export const CARMEN_SETTINGS_SECTIONS: {
  value: CarmenSettingsSection;
  label: string;
  hint: string;
}[] = [
  {
    value: "identity",
    label: "זהות ופרסונה",
    hint: "פרופיל, סגנון, מצב רוח, קול",
  },
  { value: "brain", label: "מוח ומנוע", hint: "מנוע ברירת מחדל ומפתחות AI" },
  { value: "skins", label: "סקינים", hint: "תפקידים שכרמן לובשת" },
  {
    value: "knowledge",
    label: "ידע וזיכרון",
    hint: "ידע, זיכרון, פרופילים, למידה",
  },
  { value: "tools", label: "כלים, MCP וגישות", hint: "מה מותר לכרמן להפעיל" },
  { value: "whatsapp", label: "חיבורי ווטסאפ", hint: "חיבור ראשי ומשניים" },
  {
    value: "phones",
    label: "מספרי טלפון מאושרים",
    hint: "מי מותר לדבר עם כרמן",
  },
  {
    value: "agents",
    label: "סוכנים וחיבורי AI",
    hint: "סוכני משנה, מפקח, יעדים",
  },
  { value: "approvals", label: "אישורים ופיקוח", hint: "מה מחכה לאישור" },
  {
    value: "system",
    label: "דופק ואוטומציות מערכת",
    hint: "Heartbeat ומשימות מערכת",
  },
  {
    value: "costs",
    label: "עלויות, ריצות ובדיקות",
    hint: "עלות, היסטוריה, Evals",
  },
];

function isCarmenName(name?: string | null) {
  const n = (name || "").toLowerCase();
  return n.includes("carmen") || (name || "").includes("כרמן");
}

export function useCarmenAgent(tenantId: string | null) {
  return useQuery({
    queryKey: ["ai-agents", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    select: (agents: any[]) => agents.find((a) => isCarmenName(a.name)) ?? null,
  });
}

const WA_TYPES: Record<string, { label: string; path: string }> = {
  manus_wa: { label: "Manus WA", path: "/manus-wa-settings" },
  green_api: { label: "Green API", path: "/green-api-settings" },
  meta_whatsapp: { label: "Meta WhatsApp", path: "/meta-whatsapp-settings" },
};

function WhatsAppConnections({ tenantId }: { tenantId: string | null }) {
  const { buildPath } = useTenantPath();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["carmen-wa-connections", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_integrations")
        .select("id, integration_type, display_name, is_active, settings")
        .eq("tenant_id", tenantId!)
        .in("integration_type", Object.keys(WA_TYPES));
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        החיבור הראשי הוא הטלפון של כרמן: ממנו יוצאות ההתראות, הדוחות והשיחות.
        חיבורים משניים, למשל הטלפון שלך, מפעילים את כרמן רק דרך אוטומציה עם מילת
        טריגר והנחיות משלה.
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">טוען…</p>}
      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          אין עדיין חיבורי ווטסאפ.
        </p>
      )}
      {rows.map((row: any) => {
        const meta = WA_TYPES[row.integration_type];
        const role =
          row.settings?.carmen_role ??
          (row.integration_type === "manus_wa" ? "primary" : "secondary");
        return (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">
                {row.display_name || meta?.label}
              </p>
              <p className="text-xs text-muted-foreground">{meta?.label}</p>
            </div>
            <div className="flex items-center gap-2">
              {!row.is_active && <Badge variant="secondary">כבוי</Badge>}
              <Badge variant={role === "primary" ? "default" : "outline"}>
                {role === "primary" ? "ראשי" : "משני"}
              </Badge>
              {meta && (
                <Button asChild variant="ghost" size="sm">
                  <Link to={buildPath(meta.path)}>
                    הגדרות <ExternalLink className="h-3.5 w-3.5 ms-1" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        );
      })}
      <Button asChild variant="outline" size="sm">
        <Link to={buildPath("/automations")}>אוטומציות כרמן ומילות טריגר</Link>
      </Button>
    </div>
  );
}

function SubTabs({
  items,
}: {
  items: { value: string; label: string; node: React.ReactNode }[];
}) {
  return (
    <Tabs defaultValue={items[0].value} dir="rtl">
      <TabsList className="flex h-auto flex-wrap justify-start">
        {items.map((i) => (
          <TabsTrigger key={i.value} value={i.value}>
            {i.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((i) => (
        <TabsContent key={i.value} value={i.value} className="mt-3">
          {i.node}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function CarmenSettingsSheet({
  open,
  onOpenChange,
  section,
  onSectionChange,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: CarmenSettingsSection | null;
  onSectionChange: (section: CarmenSettingsSection | null) => void;
  tenantId: string | null;
}) {
  const qc = useQueryClient();
  const { buildPath } = useTenantPath();
  const { data: agent, isLoading } = useCarmenAgent(tenantId);
  const current = useMemo(
    () => CARMEN_SETTINGS_SECTIONS.find((s) => s.value === section) ?? null,
    [section],
  );

  const updateEngine = useMutation({
    mutationFn: async (engine: string) => {
      const { error } = await supabase
        .from("ai_agents")
        .update({ engine })
        .eq("id", agent!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-agents", tenantId] });
      toast.success("המוח עודכן");
    },
    onError: (e: any) => toast.error(e.message),
  });

  function body() {
    if (!agent) return null;
    switch (section) {
      case "identity":
        return <ProfileTab agent={agent} />;
      case "brain":
        return (
          <div className="space-y-4">
            <BrainSelector
              value={agent.engine}
              onChange={(v) => updateEngine.mutate(v)}
            />
            <Button asChild variant="outline" size="sm">
              <Link to={buildPath("/llm-settings")}>מפתחות AI</Link>
            </Button>
          </div>
        );
      case "skins":
        return <SkinsManager />;
      case "knowledge":
        return (
          <SubTabs
            items={[
              {
                value: "knowledge",
                label: "ידע",
                node: <KnowledgeTab agentId={agent.id} />,
              },
              {
                value: "memory",
                label: "זיכרון",
                node: <MemoryTab agent={agent} />,
              },
              {
                value: "profiles",
                label: "פרופילי משתמשים",
                node: <UserProfilesTab agent={agent} />,
              },
              {
                value: "learning",
                label: "למידה עצמית",
                node: <AgentLearningTab agent={agent} />,
              },
            ]}
          />
        );
      case "tools":
        return (
          <SubTabs
            items={[
              {
                value: "tools",
                label: "כלים",
                node: <ToolsTab agent={agent} />,
              },
              {
                value: "registry",
                label: "מאגר כלים",
                node: <ToolRegistryTab />,
              },
              {
                value: "mcp",
                label: "MCP",
                node: <McpConnectionsTab agent={agent} />,
              },
              {
                value: "access",
                label: "גישות",
                node: <AgentAccessTab agent={agent} />,
              },
            ]}
          />
        );
      case "whatsapp":
        return <WhatsAppConnections tenantId={tenantId} />;
      case "phones":
        return <CarmenConversationAccessTab agent={agent} />;
      case "agents":
        return (
          <SubTabs
            items={[
              {
                value: "agents",
                label: "סוכני משנה",
                node: (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      הסוכנים האחרים בארגון עובדים תחת כרמן. לבחירת הסוכן שאיתו
                      מדברים בצ׳אט (Claude, Cursor, Codex…) משתמשים בבורר בראש
                      המסך.
                    </p>
                    <Button asChild variant="outline" size="sm">
                      <Link to={buildPath("/agents")}>ניהול סוכני משנה</Link>
                    </Button>
                  </div>
                ),
              },
              {
                value: "supervisor",
                label: "מפקח",
                node: <SupervisorTab agent={agent} />,
              },
              {
                value: "goals",
                label: "מטרות סוכן",
                node: <GoalsTab agentId={agent.id} />,
              },
            ]}
          />
        );
      case "approvals":
        return <ApprovalsTab agent={agent} />;
      case "system":
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              דופק (Heartbeat) ומשימות המערכת המתוזמנות.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to={buildPath("/agent-tasks")}>
                פתיחת דופק ואוטומציות מערכת
              </Link>
            </Button>
          </div>
        );
      case "costs":
        return (
          <SubTabs
            items={[
              { value: "cost", label: "עלות", node: <CostTab agent={agent} /> },
              {
                value: "runs",
                label: "ריצות",
                node: <RunsTab agent={agent} />,
              },
              {
                value: "evals",
                label: "בדיקות",
                node: <EvalsTab agent={agent} />,
              },
            ]}
          />
        );
      default:
        return null;
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        dir="rtl"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b p-4 text-right">
          <div className="flex items-center gap-2">
            {current && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSectionChange(null)}
                aria-label="חזרה לכל ההגדרות"
              >
                הגדרות
              </Button>
            )}
            <SheetTitle>{current ? current.label : "הגדרות כרמן"}</SheetTitle>
          </div>
          <SheetDescription className="sr-only">
            כל ההגדרות של כרמן במקום אחד
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isLoading && <p className="text-sm text-muted-foreground">טוען…</p>}
          {!isLoading && !agent && (
            <p className="text-sm text-muted-foreground">
              לא נמצאה כרמן בארגון הזה.
            </p>
          )}
          {agent && !current && (
            <nav className="flex flex-col gap-1">
              {CARMEN_SETTINGS_SECTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => onSectionChange(s.value)}
                  className="flex items-center justify-between rounded-lg border border-transparent px-3 py-2.5 text-right hover:border-border hover:bg-muted"
                >
                  <span>
                    <span className="block font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.hint}
                    </span>
                  </span>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </nav>
          )}
          {agent && current && body()}
        </div>
      </SheetContent>
    </Sheet>
  );
}
