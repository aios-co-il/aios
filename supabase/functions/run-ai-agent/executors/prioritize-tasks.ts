import type { PrioritizeTasksArgs } from "./task-mutations.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { PrioritizedTaskRow } from "../tool-contracts-marketing.ts";

/** Preserves the existing prioritize_tasks executor and side-effect order. */
export async function executePrioritizeTasks(
  args: PrioritizeTasksArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  // Fetch open tasks with their goals
  const { data: openTasks, error } = await supabase
    .from("tasks")
    .select(
      "id, title, status, priority, due_date, due_time, assigned_agent, goal_id, clients(name), leads(company_name), campaigners(full_name)",
    )
    .in("tenant_id", accessibleTenantIds)
    .in("status", ["open", "in_progress"])
    .order("priority", { ascending: false })
    .limit(args.limit || 30);
  if (error) {
    throw error;
  }
  // Score each task
  const now = new Date();
  const taskRows: Array<PrioritizedTaskRow> = openTasks || [];
  const scored = taskRows
    .map((t) => {
      let score = t.priority || 5;
      if (t.due_date) {
        const due = new Date(t.due_date);
        const daysLeft =
          (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (daysLeft < 0) {
          score += 10;
        } // overdue
        else if (daysLeft < 1) {
          score += 7;
        } else if (daysLeft < 3) {
          score += 4;
        } else if (daysLeft < 7) {
          score += 2;
        }
      }
      if (t.goal_id) {
        score += 2;
      } // goal-linked tasks get a boost
      if (t.assigned_agent) {
        score -= 3;
      } // already being worked on
      return {
        ...t,
        urgency_score: score,
        client_name: t.clients?.name,
        lead_name: t.leads?.company_name,
        campaigner_name: t.campaigners?.full_name,
      };
    })
    .sort((a, b) => b.urgency_score - a.urgency_score);
  return { count: scored.length, prioritized_tasks: scored };
}
