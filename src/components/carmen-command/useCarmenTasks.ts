import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getCronMeta } from "@/lib/cronJobsCatalog";
import {
  mapAgentTask,
  mapCronJob,
  mapDevTask,
  mapGoal,
  type AgentTaskSourceRow,
  type CarmenTaskRow,
  type GoalSourceRow,
} from "@/lib/carmenTaskRows";

const AGENT_TASK_COLUMNS =
  "id, title, description, status, schedule_type, cron_expression, scheduled_at, enabled, last_run, run_count, priority, agent_id, task_mode, task_skills, result, created_at, updated_at, created_by";
const AGENT_TASK_V2_COLUMNS =
  `${AGENT_TASK_COLUMNS}, next_run, timezone, engine_model` as const;

const GOAL_COLUMNS =
  "id, title, description, status, due_date, progress_percent, parent_goal_id, created_at, updated_at";
const GOAL_ENGINE_COLUMNS =
  `${GOAL_COLUMNS}, priority, execution_mode, autonomous_mode, engine_status, objective, next_run_at, last_iteration_at, iteration_count, agent_id` as const;

type SelectAttempt<T> = () => PromiseLike<{
  data: T[] | null;
  error: PostgrestError | null;
}>;

/** Select with a fallback for environments that don't have newer columns yet. */
async function selectWithFallback<T>(attempts: SelectAttempt<T>[]) {
  let lastError: PostgrestError | null = null;
  for (const attempt of attempts) {
    const { data, error } = await attempt();
    if (!error) return data ?? [];
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

async function dataOrEmpty<T>(
  query: PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  try {
    const r = await query;
    return r.error ? [] : (r.data ?? []);
  } catch {
    return [];
  }
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
        selectWithFallback<AgentTaskSourceRow>([
          () =>
            supabase
              .from("agent_tasks")
              .select(`${AGENT_TASK_V2_COLUMNS}, ai_agents(name)`)
              .eq("tenant_id", tenantId!)
              .order("created_at", { ascending: false })
              .limit(300),
          () =>
            supabase
              .from("agent_tasks")
              .select(`${AGENT_TASK_COLUMNS}, ai_agents(name)`)
              .eq("tenant_id", tenantId!)
              .order("created_at", { ascending: false })
              .limit(300),
        ]).catch(() => []),
        selectWithFallback<GoalSourceRow>([
          () =>
            supabase
              .from("goals")
              .select(GOAL_ENGINE_COLUMNS)
              .eq("tenant_id", tenantId!)
              .order("updated_at", { ascending: false })
              .limit(200),
          () =>
            supabase
              .from("goals")
              .select(GOAL_COLUMNS)
              .eq("tenant_id", tenantId!)
              .order("updated_at", { ascending: false })
              .limit(200),
        ]).catch(() => []),
        dataOrEmpty(
          supabase
            .from("dev_tasks")
            .select(
              "id, title, problem, status, priority, assigned_agent, pr_url, cursor_session_url, created_at, updated_at",
            )
            .eq("tenant_id", tenantId!)
            .order("updated_at", { ascending: false })
            .limit(100),
        ),
        // Super-admin only; everyone else simply doesn't see system jobs.
        dataOrEmpty(supabase.rpc("list_system_cron_jobs")),
      ]);

      const rows: CarmenTaskRow[] = [
        ...agentTasks
          // Anomaly alerts are notifications, not tasks Carmen runs.
          .filter((t) => t.task_mode !== "anomaly_alert")
          .map(mapAgentTask),
        ...goals.map(mapGoal),
        ...devTasks.map(mapDevTask),
        ...cronJobs.map((j) => mapCronJob(j, getCronMeta(String(j.jobname)))),
      ];
      return {
        rows,
        systemJobsVisible: cronJobs.length > 0,
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
