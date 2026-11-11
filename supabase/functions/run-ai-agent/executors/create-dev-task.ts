import type { CreateDevTaskArgs } from "./developer-task-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { resolveDevTaskActorUserId } from "../../_shared/dev-escalation-auth.ts";
import { findDuplicateDevTasks } from "../../_shared/dev-tasks.ts";
import { createDevTask } from "../../_shared/dev-tasks.ts";

/** Preserves the existing create_dev_task executor and side-effect order. */
export async function executeCreateDevTask(
  args: CreateDevTaskArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    tenantId,
    callerCampaignerId,
    callerPhone,
    conversationId,
    approval,
    actorUserId,
    devEscalationTier,
  } = context;

  const brief = {
    title: String(args.title || "").trim(),
    problem: args.problem,
    expected_behavior: args.expected_behavior,
    current_behavior: args.current_behavior,
    scope: args.scope,
    affected_areas: args.affected_areas,
    constraints: args.constraints,
    acceptance_criteria: args.acceptance_criteria,
    base_branch: args.base_branch || "develop",
    environment: args.environment || "staging",
    requested_by: args.requested_by,
  };
  if (!brief.title) {
    throw new Error("title required");
  }
  const devActorId =
    actorUserId ||
    (await resolveDevTaskActorUserId(supabase, {
      tenantId,
      userId: actorUserId,
      campaignerId: callerCampaignerId || null,
      phone: callerPhone || null,
      devEscalationTier,
    }));
  const duplicates = await findDuplicateDevTasks(
    supabase,
    tenantId,
    brief.title,
  );
  const task = await createDevTask(supabase, {
    tenantId,
    brief,
    priority: args.priority,
    assignedAgent: args.assigned_agent || "cursor",
    requestedByUserId: devActorId,
    // In an AIOS chat a task belongs to this chat: only a yes here may approve it.
    sourceConversationId: approval.devTaskTurn?.appChatUser
      ? conversationId || null
      : args.source_conversation_id || conversationId || null,
    sourceMessage: args.source_message,
    dedupOf: args.dedup_of || null,
    actorUserId: devActorId,
    goalId: args.goal_id || null,
  });
  return { task, possible_duplicates: duplicates.slice(0, 5) };
}
