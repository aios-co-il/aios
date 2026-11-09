import type { ApproveDevTaskArgs } from "./developer-task-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { resolveDevTaskActorUserId } from "../../_shared/dev-escalation-auth.ts";
import { devTaskApprovalRefusal } from "./dev-task-approval.ts";
import { approveDevTask } from "../../_shared/dev-tasks.ts";

/** Preserves the existing approve_dev_task executor and side-effect order. */
export async function executeApproveDevTask(
  args: ApproveDevTaskArgs,
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

  const approverId =
    actorUserId ||
    (await resolveDevTaskActorUserId(supabase, {
      tenantId,
      userId: actorUserId,
      campaignerId: callerCampaignerId || null,
      phone: callerPhone || null,
      devEscalationTier,
    }));
  const refusal = await devTaskApprovalRefusal(
    supabase,
    tenantId,
    String(args.dev_task_id),
    conversationId ?? null,
    approval.devTaskTurn,
    approval.userText ?? null,
    { id: approverId, tier: devEscalationTier },
  );
  if (refusal) {
    return refusal;
  }
  if (!approverId) {
    throw new Error("user auth required");
  }
  const task = await approveDevTask(
    supabase,
    tenantId,
    String(args.dev_task_id),
    approverId,
  );
  return { task };
}
