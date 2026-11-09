import type { GetDashboardStatsArgs } from "./ad-report-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AgentRow } from "../database-contracts.ts";

/** Preserves the existing get_dashboard_stats executor and side-effect order. */
export async function executeGetDashboardStats(
  args: GetDashboardStatsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const [leadsRes, clientsRes, tasksRes, onboardingRes] = await Promise.all([
    supabase
      .from("leads")
      .select("status", { count: "exact", head: false })
      .in("tenant_id", accessibleTenantIds),
    supabase
      .from("clients")
      .select("status", { count: "exact", head: false })
      .in("tenant_id", accessibleTenantIds),
    supabase
      .from("tasks")
      .select("status", { count: "exact", head: false })
      .in("tenant_id", accessibleTenantIds)
      .eq("status", "open"),
    supabase
      .from("client_onboarding")
      .select("status", { count: "exact", head: false })
      .in("tenant_id", accessibleTenantIds)
      .eq("status", "in_progress" as AgentRow<"client_onboarding">["status"]),
  ]);
  const leadStatuses: Array<Pick<AgentRow<"leads">, "status">> =
    leadsRes.data || [];
  const clientStatuses: Array<Pick<AgentRow<"clients">, "status">> =
    clientsRes.data || [];
  const leadsByStatus = leadStatuses.reduce<Record<string, number>>(
    (acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    },
    {},
  );
  const clientsByStatus = clientStatuses.reduce<Record<string, number>>(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    },
    {},
  );
  return {
    leads: { total: leadsRes.data?.length || 0, by_status: leadsByStatus },
    clients: {
      total: clientsRes.data?.length || 0,
      by_status: clientsByStatus,
    },
    open_tasks: tasksRes.data?.length || 0,
    active_onboarding: onboardingRes.data?.length || 0,
  };
}
