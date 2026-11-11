import type { ListMyAgentTasksArgs } from "./task-queries.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_my_agent_tasks executor and side-effect order. */
export async function executeListMyAgentTasks(
  args: ListMyAgentTasksArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, agentId } = context;

  let q = supabase
    .from("agent_tasks")
    .select(
      "id, title, description, status, schedule_type, scheduled_at, last_run, run_count, result, created_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(args.limit || 10);
  if (agentId) {
    q = q.eq("agent_id", agentId);
  }
  if (args.status) {
    q = q.eq("status", args.status);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  /** Formats saved timestamps in the same Israel time zone as the tool contract. */
  function fmtIl(iso: string | null) {
    return iso
      ? new Date(iso).toLocaleString("he-IL", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Jerusalem",
        })
      : null;
  }
  return {
    count: data.length,
    tasks: data.map((t) => {
      const result = t.result as {
        last_output?: unknown;
        error?: unknown;
      } | null;
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        schedule_type: t.schedule_type,
        scheduled_at_israel: fmtIl(t.scheduled_at),
        last_run_israel: fmtIl(t.last_run),
        run_count: t.run_count || 0,
        last_output: result?.last_output
          ? String(result.last_output).slice(0, 200)
          : result?.error
            ? `שגיאה: ${String(result.error).slice(0, 200)}`
            : null,
        description_preview: t.description
          ? String(t.description).slice(0, 120)
          : null,
      };
    }),
  };
}
