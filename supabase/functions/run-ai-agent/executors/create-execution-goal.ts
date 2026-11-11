import type { CreateExecutionGoalArgs } from "./goal-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { findDuplicateGoals } from "../../_shared/goal-execution.ts";
import { createUnifiedGoal } from "../../_shared/goal-execution.ts";
import { addGoalMilestone } from "../../_shared/goal-execution.ts";

/** Preserves the existing create_execution_goal executor and side-effect order. */
export async function executeCreateExecutionGoal(
  args: CreateExecutionGoalArgs,
  context: ToolExecutionContext,
) {
  const { name, supabase, tenantId, actorUserId } = context;

  const title = String(args.title || "").trim();
  if (!title) {
    throw new Error("title required");
  }
  const autonomous = name === "create_autonomous_goal" || !!args.autonomous;
  const duplicates = await findDuplicateGoals(supabase, tenantId, title);
  const { goal, criteria } = await createUnifiedGoal(supabase, {
    tenantId,
    title,
    description: args.description,
    dueDate: args.due_date,
    priority: args.priority,
    completionCriteria: args.completion_criteria,
    nextAction: args.next_action,
    ownerUserId: actorUserId,
    actorUserId,
    autonomous,
    objective: args.objective,
    constraints: args.constraints,
    scope: args.scope,
    riskLevel: args.risk_level,
    successCriteria: args.success_criteria,
  });
  if (!autonomous && Array.isArray(args.milestones)) {
    for (const [i, m] of args.milestones.entries()) {
      if (m?.title) {
        await addGoalMilestone(supabase, {
          tenantId,
          goalId: goal.id,
          title: String(m.title),
          description: m.description,
          dueDate: m.due_date,
          sortOrder: i,
          actorUserId,
        });
      }
    }
  }
  return { goal, criteria, possible_duplicates: duplicates.slice(0, 5) };
}
