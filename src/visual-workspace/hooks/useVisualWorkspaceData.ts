import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import type {
  IslandSummary,
  IslandStatus,
} from "../types/visualWorkspaceTypes";

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};

const sevenDaysAgo = () => new Date(Date.now() - 7 * 86400_000).toISOString();

function deriveStatus(alerts: number, errors = 0): IslandStatus {
  if (alerts >= 3 || errors >= 3) return "alert";
  if (alerts >= 1 || errors >= 1) return "watch";
  return "good";
}

type QueryResult = { error: { message: string } | null };

/** Each tile falls back to empty, so a failed query only shows in the console. */
function warnQueryError(error: unknown) {
  if (error) {
    console.warn("[visual-workspace] query failed:", error);
  }
}

export function useVisualWorkspaceData() {
  const { tenantId } = useCurrentTenant();

  return useQuery({
    queryKey: ["visual-workspace-data", tenantId],
    refetchInterval: 60_000,
    queryFn: tenantId ? () => loadWorkspaceData(tenantId) : skipToken,
  });
}

async function loadWorkspaceData(tid: string) {
  const monthStart = startOfMonth();
  const weekAgo = sevenDaysAgo();
  const todayIso = new Date().toISOString();

  const safeCount = async (
    q: PromiseLike<QueryResult & { count: number | null }>,
  ): Promise<number> => {
    try {
      const r = await q;
      warnQueryError(r.error);
      return r.count ?? 0;
    } catch (error) {
      warnQueryError(error);
      return 0;
    }
  };
  const safeRows = async <R extends QueryResult & { data: unknown[] | null }>(
    q: PromiseLike<R>,
  ): Promise<NonNullable<R["data"]> | []> => {
    try {
      const r = await q;
      warnQueryError(r.error);
      return r.data ?? [];
    } catch (error) {
      warnQueryError(error);
      return [];
    }
  };
  const safeMaybe = async <R extends QueryResult & { data: unknown }>(
    q: PromiseLike<R>,
  ): Promise<R["data"] | null> => {
    try {
      const r = await q;
      warnQueryError(r.error);
      return r.data ?? null;
    } catch (error) {
      warnQueryError(error);
      return null;
    }
  };

  const tenantRow = await safeMaybe(
    supabase.from("tenants").select("name").eq("id", tid).maybeSingle(),
  );

  const [
    clientsActive,
    clientsAtRisk,
    tasksOpen,
    tasksUrgent,
    agentsActive,
    campaignAlertsOpen,
    reportAlertsOpen,
    leadsWeek,
    leadsHot,
    socialPlanned,
    automationsCount,
    automationExecsWeek,
    errorLogsWeek,
    integrationsCount,
    usersCount,
    agentRunsActive,
    goalsOpen,
    incomePayments,
    expensePayments,
  ] = await Promise.all([
    safeCount(
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .neq("status", "ended"),
    ),
    safeCount(
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .in("mood_status", ["churn_risk", "not_progressing"]),
    ),
    safeCount(
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .in("status", ["open", "in_progress"]),
    ),
    safeCount(
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .in("status", ["open", "in_progress"])
        .lte("due_date", todayIso),
    ),
    safeCount(
      supabase
        .from("ai_agents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .eq("active", true),
    ),
    safeCount(
      supabase
        .from("campaign_alerts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .is("resolved_at", null),
    ),
    safeCount(
      supabase
        .from("report_alerts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .eq("is_active", true),
    ),
    safeCount(
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .gte("created_at", weekAgo),
    ),
    safeCount(
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .eq("status", "hot"),
    ),
    safeCount(
      supabase
        .from("social_publications")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .eq("status", "scheduled"),
    ),
    safeCount(
      supabase
        .from("automations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .eq("active", true),
    ),
    safeCount(
      supabase
        .from("automation_executions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .gte("started_at", weekAgo),
    ),
    safeCount(
      supabase
        .from("error_logs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .gte("created_at", weekAgo),
    ),
    safeCount(
      supabase
        .from("tenant_integrations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .eq("is_active", true),
    ),
    safeCount(
      supabase
        .from("tenant_users")
        .select("user_id", { count: "exact", head: true })
        .eq("tenant_id", tid),
    ),
    safeCount(
      supabase
        .from("agent_runs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .in("status", ["running", "queued"]),
    ),
    safeCount(
      supabase
        .from("goals")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .neq("status", "completed"),
    ),
    safeRows(
      supabase
        .from("income_payments")
        .select("amount")
        .eq("tenant_id", tid)
        .gte("payment_date", monthStart),
    ),
    safeRows(
      supabase
        .from("expense_payments")
        .select("amount")
        .eq("tenant_id", tid)
        .gte("payment_date", monthStart),
    ),
  ]);

  const incomeMonth = incomePayments.reduce(
    (s: number, r) => s + Number(r.amount || 0),
    0,
  );
  const expenseMonth = expensePayments.reduce(
    (s: number, r) => s + Number(r.amount || 0),
    0,
  );

  const businessName = tenantRow?.name || "העסק שלי";
  const totalAlerts = campaignAlertsOpen + reportAlertsOpen;

  const islands: IslandSummary[] = [
    {
      id: "management",
      name: "ניהול",
      description: "יעדים, KPI והחלטות",
      agentRole: "ceo",
      agentName: "CEO Agent",
      kpis: [
        { label: "יעדים פתוחים", value: goalsOpen },
        {
          label: "משימות דחופות",
          value: tasksUrgent,
          tone: tasksUrgent ? "warning" : "default",
        },
        {
          label: "לקוחות בסיכון",
          value: clientsAtRisk,
          tone: clientsAtRisk ? "danger" : "default",
        },
      ],
      openTasks: tasksOpen,
      alerts: totalAlerts,
      status: deriveStatus(totalAlerts + clientsAtRisk),
    },
    {
      id: "marketing",
      name: "שיווק",
      description: "קמפיינים, לידים, סושיאל",
      agentRole: "marketing",
      agentName: "CMO Agent",
      kpis: [
        { label: "אוטומציות פעילות", value: automationsCount },
        { label: "לידים השבוע", value: leadsWeek },
        {
          label: "התראות קמפיינים",
          value: campaignAlertsOpen,
          tone: campaignAlertsOpen ? "warning" : "default",
        },
      ],
      openTasks: 0,
      alerts: campaignAlertsOpen,
      status: deriveStatus(campaignAlertsOpen),
    },
    {
      id: "sales",
      name: "מכירות",
      description: "Pipeline, לידים, עסקאות",
      agentRole: "sales",
      agentName: "Sales Agent",
      kpis: [
        {
          label: "לידים חמים",
          value: leadsHot,
          tone: leadsHot ? "success" : "default",
        },
        { label: "לידים השבוע", value: leadsWeek },
        { label: "Pipeline", value: leadsWeek + leadsHot },
      ],
      openTasks: 0,
      alerts: 0,
      status: "good",
    },
    {
      id: "creative",
      name: "קריאייטיב",
      description: "תוכן, עיצובים, וידאו",
      agentRole: "creative",
      agentName: "Creative Agent",
      kpis: [
        { label: "פוסטים מתוכננים", value: socialPlanned },
        { label: "משימות פתוחות", value: tasksOpen },
        { label: "התראות", value: 0 },
      ],
      openTasks: tasksOpen,
      alerts: 0,
      status: "good",
    },
    {
      id: "finance",
      name: "כספים",
      description: "הכנסות, הוצאות, גבייה",
      agentRole: "finance",
      agentName: "CFO Agent",
      kpis: [
        {
          label: "הכנסות החודש",
          value: `₪${Math.round(incomeMonth).toLocaleString()}`,
          tone: "success",
        },
        {
          label: "הוצאות החודש",
          value: `₪${Math.round(expenseMonth).toLocaleString()}`,
        },
      ],
      openTasks: 0,
      alerts: 0,
      status: deriveStatus(0),
    },
    {
      id: "development",
      name: "פיתוח",
      description: "אוטומציות, אינטגרציות, API",
      agentRole: "dev",
      agentName: "CTO Agent",
      kpis: [
        { label: "אוטומציות", value: automationsCount },
        { label: "ריצות השבוע", value: automationExecsWeek },
        {
          label: "שגיאות השבוע",
          value: errorLogsWeek,
          tone: errorLogsWeek ? "danger" : "default",
        },
      ],
      openTasks: 0,
      alerts: errorLogsWeek,
      status: deriveStatus(0, errorLogsWeek),
    },
    {
      id: "customer_success",
      name: "שירות לקוחות",
      description: "לקוחות, פניות, שביעות רצון",
      agentRole: "customer_success",
      agentName: "CS Agent",
      kpis: [
        { label: "לקוחות פעילים", value: clientsActive },
        {
          label: "לקוחות בסיכון",
          value: clientsAtRisk,
          tone: clientsAtRisk ? "danger" : "default",
        },
        { label: "משימות פתוחות", value: tasksOpen },
      ],
      openTasks: tasksOpen,
      alerts: clientsAtRisk,
      status: deriveStatus(clientsAtRisk),
    },
    {
      id: "system",
      name: "ניהול מערכת",
      description: "משתמשים, הרשאות, אינטגרציות",
      agentRole: "system",
      agentName: "System Admin",
      kpis: [
        { label: "משתמשים", value: usersCount },
        { label: "אינטגרציות פעילות", value: integrationsCount },
        {
          label: "שגיאות השבוע",
          value: errorLogsWeek,
          tone: errorLogsWeek ? "warning" : "default",
        },
      ],
      openTasks: 0,
      alerts: 0,
      status: deriveStatus(0, errorLogsWeek),
    },
    {
      id: "agents",
      name: "אייג׳נטים",
      description: "סוכני AI ופעולותיהם",
      agentRole: "ceo",
      agentName: "Agents Hub",
      kpis: [
        { label: "אייג׳נטים פעילים", value: agentsActive },
        { label: "ריצות פעילות", value: agentRunsActive },
        { label: "אוטומציות", value: automationsCount },
      ],
      openTasks: 0,
      alerts: 0,
      status: "good",
    },
  ];

  return {
    businessName,
    core: {
      businessName,
      clientsActive,
      clientsAtRisk,
      tasksOpen,
      tasksUrgent,
      agentsActive,
      alerts: totalAlerts,
      incomeMonth,
    },
    islands,
  };
}
