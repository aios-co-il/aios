import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCronMeta } from "@/lib/cronJobsCatalog";
import {
  mapAgentTask,
  mapCronJob,
  mapDevTask,
  mapGoal,
  type CarmenTaskRow,
} from "@/lib/carmenTaskRows";

const db = supabase as any;

const AGENT_TASK_COLUMNS =
  "id, title, description, status, schedule_type, cron_expression, scheduled_at, enabled, last_run, run_count, priority, agent_id, task_mode, task_skills, result, created_at, updated_at, created_by";
const AGENT_TASK_V2_COLUMNS = `${AGENT_TASK_COLUMNS}, next_run, timezone, engine_model`;

const GOAL_COLUMNS =
  "id, title, description, status, due_date, progress_percent, parent_goal_id, created_at, updated_at";
const GOAL_ENGINE_COLUMNS = `${GOAL_COLUMNS}, priority, execution_mode, autonomous_mode, engine_status, objective, next_run_at, last_iteration_at, iteration_count, agent_id`;

/** Select with a fallback for environments that don't have newer columns yet. */
async function selectWithFallback(
  table: string,
  columns: string[],
  build: (q: any) => any,
) {
  let lastError: any = null;
  for (const cols of columns) {
    const { data, error } = await build(db.from(table).select(cols));
    if (!error) return (data ?? []) as Record<string, any>[];
    lastError = error;
    // 42703 = undefined column; PGRST204/PGRST200 = schema cache misses.
    if (
      !/column|schema cache|42703|PGRST2/i.test(
        String(error.message ?? error.code),
      )
    )
      break;
  }
  throw lastError;
}

export const carmenTasksKey = (tenantId: string | null) =>
  ["carmen-tasks", tenantId] as const;

export function useCarmenTasks(tenantId: string | null) {
  return useQuery({
    queryKey: carmenTasksKey(tenantId),
    enabled: !!tenantId,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [agentTasks, goals, devTasks, cronJobs] = await Promise.all([
        selectWithFallback(
          "agent_tasks",
          [
            `${AGENT_TASK_V2_COLUMNS}, ai_agents(name)`,
            `${AGENT_TASK_COLUMNS}, ai_agents(name)`,
          ],
          (q) =>
            q
              .eq("tenant_id", tenantId!)
              .order("created_at", { ascending: false })
              .limit(300),
        ).catch(() => []),
        selectWithFallback("goals", [GOAL_ENGINE_COLUMNS, GOAL_COLUMNS], (q) =>
          q
            .eq("tenant_id", tenantId!)
            .order("updated_at", { ascending: false })
            .limit(200),
        ).catch(() => []),
        db
          .from("dev_tasks")
          .select(
            "id, title, problem, status, priority, assigned_agent, pr_url, cursor_session_url, created_at, updated_at",
          )
          .eq("tenant_id", tenantId!)
          .order("updated_at", { ascending: false })
          .limit(100)
          .then((r: any) => (r.error ? [] : (r.data ?? [])))
          .catch(() => []),
        // Super-admin only; everyone else simply doesn't see system jobs.
        db
          .rpc("list_system_cron_jobs")
          .then((r: any) => (r.error ? [] : (r.data ?? [])))
          .catch(() => []),
      ]);

      const rows: CarmenTaskRow[] = [
        ...agentTasks
          // Anomaly alerts are notifications, not tasks Carmen runs.
          .filter((t) => t.task_mode !== "anomaly_alert")
          .map(mapAgentTask),
        ...goals.map(mapGoal),
        ...(devTasks as Record<string, any>[]).map(mapDevTask),
        ...(cronJobs as Record<string, any>[]).map((j) =>
          mapCronJob(j, getCronMeta(String(j.jobname))),
        ),
      ];
      return {
        rows,
        systemJobsVisible: (cronJobs as unknown[]).length > 0,
      };
    },
  });
}

export type CarmenAgentOption = {
  id: string;
  name: string;
  engine: string | null;
};

export function useTenantAgents(tenantId: string | null) {
  return useQuery({
    queryKey: ["carmen-task-agents", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CarmenAgentOption[]> => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("id, name, engine")
        .eq("tenant_id", tenantId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as CarmenAgentOption[];
    },
  });
}
