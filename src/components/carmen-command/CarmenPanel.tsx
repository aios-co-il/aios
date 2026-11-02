import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  Brain,
  ChevronLeft,
  Coins,
  Contact,
  HeartPulse,
  Library,
  KeyRound,
  ListTodo,
  MessageCircle,
  Palette,
  Plug,
  ShieldCheck,
  Sparkles,
  UserRound,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import { CarmenPermissionsTab } from "@/components/agents/tabs/CarmenPermissionsTab";
import { BrainConnectionsTab } from "@/components/agents/tabs/brain-connections/BrainConnectionsTab";
import { AgentLearningTab } from "@/components/agents/tabs/AgentLearningTab";
import { HeartbeatSettingsPanel } from "@/components/agents/HeartbeatSettingsPanel";
import SkinsManager from "@/pages/SkinsManager";
import LLMSettings from "@/pages/LLMSettings";
import ManusWhatsAppSettings from "@/pages/ManusWhatsAppSettings";
import GreenAPISettings from "@/pages/GreenAPISettings";
import MetaWhatsAppSettings from "@/pages/MetaWhatsAppSettings";
import type { TaskFilter } from "@/lib/carmenTaskRows";
import { FILTERS } from "@/lib/carmenTaskRows";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  resolveCarmenConnectionRole,
  type CarmenConnectionRole,
} from "../../../supabase/functions/_shared/carmen-connection-role.ts";
import { CarmenAutomationsList } from "./CarmenAutomationsList";
import { SecondaryConnectionAutomationForm } from "./SecondaryConnectionAutomationForm";
import { ReportSenderDefaultCard } from "@/components/report-sender/ReportSenderDefaultCard";
import { CarmenSubAgents, isCarmenName } from "./CarmenSubAgents";
import { CarmenTasksView, NewTaskChooser } from "./tasks/CarmenTasksView";
import { AgentTaskEditor } from "./tasks/AgentTaskEditor";
import { GoalEditor } from "./tasks/GoalEditor";
import { DevTaskEditor } from "./tasks/DevTaskEditor";
import { SystemJobEditor } from "./tasks/SystemJobEditor";

/**
 * Carmen's single right-side panel. Everything Carmen — tasks and settings —
 * opens here, driven by `?panel=<path>`, so nothing navigates away from her
 * screen. Paths:
 *   ""                         root menu
 *   tasks | tasks:<filter>     unified tasks list
 *   task/<source>/<id>         edit one task (agent_tasks|goals|dev_tasks|cron_job)
 *   task/heartbeat             heartbeat + campaign pulse settings
 *   new | new/<kind>           create (task|recurring|goal|dev|template/<key>)
 *   settings/<section>[/<id>]  one settings section (optionally drilled in)
 */

export type SettingsSection =
  | "identity"
  | "brain"
  | "skins"
  | "knowledge"
  | "tools"
  | "whatsapp"
  | "automations"
  | "phones"
  | "permissions"
  | "agents"
  | "approvals"
  | "costs";

export const SETTINGS_SECTIONS: {
  value: SettingsSection;
  label: string;
  hint: string;
  icon: typeof Bot;
}[] = [
  {
    value: "identity",
    label: "זהות ופרסונה",
    hint: "פרופיל, סגנון, מצב רוח, קול",
    icon: UserRound,
  },
  {
    value: "brain",
    label: "מוחות, חיבורים ומפתחות AI",
    hint: "בורר המוחות, מודלים מחוברים, המוח הפנימי",
    icon: Brain,
  },
  {
    value: "skins",
    label: "סקינים",
    hint: "תפקידים שכרמן לובשת",
    icon: Palette,
  },
  {
    value: "knowledge",
    label: "ידע וזיכרון",
    hint: "ידע, זיכרון, פרופילים, למידה",
    icon: Library,
  },
  {
    value: "tools",
    label: "כלים, MCP וגישות",
    hint: "מה מותר לכרמן להפעיל",
    icon: Plug,
  },
  {
    value: "whatsapp",
    label: "חיבורי ווטסאפ",
    hint: "חיבור ראשי ומשניים",
    icon: MessageCircle,
  },
  {
    value: "automations",
    label: "אוטומציות ומילות טריגר",
    hint: "מתי כרמן נכנסת לשיחה ובאיזה חיבור",
    icon: Workflow,
  },
  {
    value: "phones",
    label: "מספרי טלפון מאושרים",
    hint: "מי מותר לדבר עם כרמן",
    icon: Contact,
  },
  {
    value: "permissions",
    label: "הרשאות",
    hint: "מי עובד עם כרמן ובאילו מוחות",
    icon: KeyRound,
  },
  {
    value: "agents",
    label: "סוכנים וחיבורי AI",
    hint: "סוכני משנה, מפקח, מטרות סוכן",
    icon: Bot,
  },
  {
    value: "approvals",
    label: "אישורים ופיקוח",
    hint: "מה מחכה לאישור",
    icon: ShieldCheck,
  },
  {
    value: "costs",
    label: "עלויות, ריצות ובדיקות",
    hint: "עלות, היסטוריה, Evals",
    icon: Coins,
  },
];

const ROLE_HINTS: Record<CarmenConnectionRole, string> = {
  primary: "הטלפון של כרמן",
  secondary: "רק עם מילת טריגר",
  none: "כרמן לא עונה כאן",
};

const WA_TYPES: Record<string, { label: string }> = {
  manus_wa: { label: "Manus WA" },
  green_api: { label: "Green API" },
  meta_whatsapp: { label: "Meta WhatsApp" },
};

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

function MenuItem({
  label,
  hint,
  icon: Icon,
  onClick,
  badge,
}: {
  label: string;
  hint?: string;
  icon: typeof Bot;
  onClick: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-right hover:border-border hover:bg-muted"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {hint && (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
      {badge}
      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function WhatsAppConnections({
  tenantId,
  onNavigate,
}: {
  tenantId: string | null;
  onNavigate: (path: string) => void;
}) {
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
  const qc = useQueryClient();
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const tenantHasActiveManus = rows.some(
    (r: any) => r.integration_type === "manus_wa" && r.is_active,
  );
  const setRole = useMutation({
    mutationFn: async ({
      row,
      role,
    }: {
      row: any;
      role: CarmenConnectionRole;
    }) => {
      if (
        role === "primary" &&
        rows.some(
          (r: any) =>
            r.id !== row.id &&
            r.is_active &&
            resolveCarmenConnectionRole(r, { tenantHasActiveManus }) ===
              "primary",
        )
      ) {
        throw new Error(
          "כבר יש חיבור ראשי. העבירו אותו קודם למשני — לכרמן יש טלפון ראשי אחד.",
        );
      }
      const { error } = await supabase
        .from("tenant_integrations")
        .update({ settings: { ...(row.settings || {}), carmen_role: role } })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carmen-wa-connections", tenantId] });
      toast.success("התפקיד עודכן");
    },
    onError: (e: any) => toast.error(e?.message ?? String(e)),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        החיבור הראשי הוא הטלפון של כרמן: ממנו יוצאות ההתראות, הדוחות והשיחות.
        בחיבור משני, למשל הטלפון שלך, כרמן עונה רק כשכותבים את מילת הטריגר, רק
        דרך אוטומציה שמוצמדת לחיבור הזה (עם הנחיות משלה), ולעולם לא שולחת ממנו
        התראות מערכת.
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">טוען…</p>}
      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          אין עדיין חיבורי ווטסאפ.
        </p>
      )}
      {rows.map((row: any) => {
        const meta = WA_TYPES[row.integration_type];
        const role = resolveCarmenConnectionRole(row, {
          tenantHasActiveManus,
        });
        return (
          <div
            key={row.id}
            className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
          >
            <button
              type="button"
              onClick={() =>
                onNavigate(`settings/whatsapp/${row.integration_type}`)
              }
              className="min-w-0 flex-1 text-right hover:underline"
            >
              <span className="block truncate font-medium">
                {row.display_name || meta?.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {meta?.label} · {ROLE_HINTS[role]}
              </span>
            </button>
            <span className="flex items-center gap-2">
              {!row.is_active && <Badge variant="secondary">כבוי</Badge>}
              {role === "secondary" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setCreatingFor(creatingFor === row.id ? null : row.id)
                  }
                >
                  + אוטומציה
                </Button>
              )}
              <Select
                value={role}
                onValueChange={(v) =>
                  setRole.mutate({ row, role: v as CarmenConnectionRole })
                }
                disabled={setRole.isPending}
              >
                <SelectTrigger className="h-8 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[120]">
                  <SelectItem value="primary">ראשי</SelectItem>
                  <SelectItem value="secondary">משני</SelectItem>
                  <SelectItem value="none">כבוי לכרמן</SelectItem>
                </SelectContent>
              </Select>
            </span>
            {creatingFor === row.id && (
              <div className="w-full">
                <SecondaryConnectionAutomationForm
                  tenantId={tenantId}
                  integration={row}
                  onDone={() => setCreatingFor(null)}
                />
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2 pt-1">
        {Object.entries(WA_TYPES).map(([type, meta]) => (
          <Button
            key={type}
            variant="outline"
            size="sm"
            onClick={() => onNavigate(`settings/whatsapp/${type}`)}
          >
            הגדרות {meta.label}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate("settings/automations")}
        >
          אוטומציות ומילות טריגר
        </Button>
      </div>
      {tenantId && <ReportSenderDefaultCard tenantId={tenantId} />}
    </div>
  );
}

function parsePath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return { head: parts[0] ?? "", parts };
}

/** Parent path for the back button. */
export function parentPath(path: string): string | null {
  if (!path) return null;
  const { head, parts } = parsePath(path);
  if (head.startsWith("tasks")) return "";
  if (head === "task") return "tasks";
  if (head === "new") return parts.length > 1 ? "new" : "tasks";
  if (head === "settings")
    return parts.length > 2 ? parts.slice(0, 2).join("/") : "";
  return "";
}

export function CarmenPanel({
  open,
  path,
  onNavigate,
  onClose,
  tenantId,
}: {
  open: boolean;
  path: string;
  onNavigate: (path: string) => void;
  onClose: () => void;
  tenantId: string | null;
}) {
  const qc = useQueryClient();
  const { data: agent, isLoading } = useCarmenAgent(tenantId);
  const { head, parts } = useMemo(() => parsePath(path), [path]);

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

  const manageKeys = () => onNavigate("settings/brain");
  const backTo = parentPath(path);
  const tasksFilter = (head.split(":")[1] as TaskFilter) || "all";
  const settingsSection =
    head === "settings" ? (parts[1] as SettingsSection) : null;
  const sectionMeta = SETTINGS_SECTIONS.find(
    (s) => s.value === settingsSection,
  );

  let title = "כרמן";
  if (head.startsWith("tasks")) title = "משימות כרמן";
  else if (head === "task")
    title = parts[1] === "heartbeat" ? "דופק ובדיקות דופק" : "עריכת משימה";
  else if (head === "new")
    title = parts.length > 1 ? "משימה חדשה" : "מה ליצור?";
  else if (sectionMeta) title = sectionMeta.label;

  const wide =
    head === "settings" &&
    settingsSection === "whatsapp" &&
    parts[2] === "meta_whatsapp";

  function settingsBody() {
    if (!agent) return null;
    switch (settingsSection) {
      case "identity":
        return <ProfileTab agent={agent} onManageKeys={manageKeys} />;
      case "brain":
        return (
          <SubTabs
            items={[
              {
                value: "connections",
                label: "מוחות וחיבורים",
                node: <BrainConnectionsTab />,
              },
              {
                value: "internal",
                label: "המוח הפנימי של כרמן",
                node: (
                  <div className="space-y-5">
                    <BrainSelector
                      value={agent.engine}
                      onChange={(v) => updateEngine.mutate(v)}
                      onManageKeys={manageKeys}
                    />
                    <LLMSettings embedded />
                  </div>
                ),
              },
            ]}
          />
        );
      case "skins":
        return <SkinsManager embedded />;
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
      case "whatsapp": {
        const type = parts[2];
        if (type === "manus_wa") return <ManusWhatsAppSettings embedded />;
        if (type === "green_api") return <GreenAPISettings embedded />;
        if (type === "meta_whatsapp") return <MetaWhatsAppSettings embedded />;
        return (
          <WhatsAppConnections tenantId={tenantId} onNavigate={onNavigate} />
        );
      }
      case "automations":
        return <CarmenAutomationsList tenantId={tenantId} />;
      case "phones":
        return <CarmenConversationAccessTab agent={agent} />;
      case "permissions":
        return <CarmenPermissionsTab />;
      case "agents":
        if (parts[2])
          return (
            <CarmenSubAgents
              tenantId={tenantId}
              agentId={parts[2]}
              onNavigate={onNavigate}
              onManageKeys={manageKeys}
            />
          );
        return (
          <SubTabs
            items={[
              {
                value: "agents",
                label: "סוכני משנה",
                node: (
                  <CarmenSubAgents
                    tenantId={tenantId}
                    agentId={null}
                    onNavigate={onNavigate}
                    onManageKeys={manageKeys}
                  />
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

  function body() {
    if (head.startsWith("tasks")) {
      return (
        <CarmenTasksView
          tenantId={tenantId}
          filter={
            FILTERS.some((f) => f.value === tasksFilter) ? tasksFilter : "all"
          }
          onFilterChange={(f) =>
            onNavigate(f === "all" ? "tasks" : `tasks:${f}`)
          }
          onNavigate={onNavigate}
        />
      );
    }
    if (head === "task") {
      const [, source, id] = parts;
      const done = () => onNavigate("tasks");
      if (source === "heartbeat") return <HeartbeatSettingsPanel />;
      if (source === "agent_tasks")
        return (
          <AgentTaskEditor
            key={id}
            tenantId={tenantId}
            taskId={id}
            onDone={done}
          />
        );
      if (source === "goals")
        return (
          <GoalEditor key={id} tenantId={tenantId} goalId={id} onDone={done} />
        );
      if (source === "dev_tasks")
        return (
          <DevTaskEditor
            key={id}
            tenantId={tenantId}
            devTaskId={id}
            onDone={done}
          />
        );
      if (source === "cron_job")
        return (
          <SystemJobEditor
            key={id}
            tenantId={tenantId}
            jobId={id}
            onDone={done}
          />
        );
      return null;
    }
    if (head === "new") {
      const done = () => onNavigate("tasks");
      const kind = parts[1];
      if (!kind) return <NewTaskChooser onNavigate={onNavigate} />;
      if (kind === "task")
        return (
          <AgentTaskEditor
            key="new-task"
            tenantId={tenantId}
            taskId={null}
            onDone={done}
          />
        );
      if (kind === "recurring")
        return (
          <AgentTaskEditor
            key="new-rec"
            tenantId={tenantId}
            taskId={null}
            defaultRecurring
            onDone={done}
          />
        );
      if (kind === "template")
        return (
          <AgentTaskEditor
            key={`tpl-${parts[2]}`}
            tenantId={tenantId}
            taskId={null}
            templateKey={parts[2]}
            onDone={done}
          />
        );
      if (kind === "goal")
        return (
          <GoalEditor
            key="new-goal"
            tenantId={tenantId}
            goalId={null}
            onDone={done}
          />
        );
      if (kind === "dev")
        return (
          <DevTaskEditor
            key="new-dev"
            tenantId={tenantId}
            devTaskId={null}
            onDone={done}
          />
        );
      return null;
    }
    if (head === "settings") {
      if (isLoading)
        return <p className="text-sm text-muted-foreground">טוען…</p>;
      if (!agent)
        return (
          <p className="text-sm text-muted-foreground">
            לא נמצאה כרמן בארגון הזה.
          </p>
        );
      return settingsBody();
    }
    // Root menu: tasks first, then every setting.
    return (
      <div className="space-y-4">
        <div>
          <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">
            משימות
          </p>
          <MenuItem
            label="כל המשימות"
            hint="חד-פעמיות, חוזרות, יעדים, פיתוח ומשימות מערכת"
            icon={ListTodo}
            onClick={() => onNavigate("tasks")}
          />
          <MenuItem
            label="דופק ובדיקות דופק"
            hint="Heartbeat, שעות פעילות ובדיקת דופק לקמפיינים"
            icon={HeartPulse}
            onClick={() => onNavigate("task/heartbeat")}
          />
          <MenuItem
            label="משימה חדשה"
            icon={Sparkles}
            onClick={() => onNavigate("new")}
          />
        </div>
        <div>
          <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">
            הגדרות
          </p>
          {SETTINGS_SECTIONS.map((s) => (
            <MenuItem
              key={s.value}
              label={s.label}
              hint={s.hint}
              icon={s.icon}
              onClick={() => onNavigate(`settings/${s.value}`)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        dir="rtl"
        className={`flex w-full flex-col gap-0 p-0 [&>button]:left-4 [&>button]:right-auto ${
          wide ? "sm:max-w-4xl" : "sm:max-w-2xl"
        }`}
      >
        <SheetHeader className="border-b p-4 pe-12 text-right sm:text-right">
          <div className="flex items-center gap-1">
            {backTo !== null && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => onNavigate(backTo)}
                aria-label="חזרה"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            <SheetTitle className="truncate">{title}</SheetTitle>
          </div>
          <SheetDescription className="sr-only">
            המשימות וההגדרות של כרמן במקום אחד
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{body()}</div>
      </SheetContent>
    </Sheet>
  );
}
