import type { DispatchDevTaskArgs } from "./developer-task-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { devTaskApprovalRefusal } from "./dev-task-approval.ts";
import { dispatchDevTask } from "../../_shared/dev-tasks.ts";
import { DevTaskNotApprovedError } from "../../_shared/dev-tasks.ts";

/** Preserves the existing dispatch_dev_task executor and side-effect order. */
export async function executeDispatchDevTask(
  args: DispatchDevTaskArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    tenantId,
    conversationId,
    approval,
    actorUserId,
    devEscalationTier,
  } = context;

  const refusal = await devTaskApprovalRefusal(
    supabase,
    tenantId,
    String(args.dev_task_id),
    conversationId ?? null,
    approval.devTaskTurn,
    approval.userText ?? null,
    { id: actorUserId, tier: devEscalationTier },
  );
  if (refusal) {
    return refusal;
  }
  try {
    return await dispatchDevTask(supabase, {
      tenantId,
      taskId: String(args.dev_task_id),
      actorUserId,
    });
  } catch (e) {
    if (e instanceof DevTaskNotApprovedError) {
      return { error: e.code, message: e.message };
    }
    throw e;
  }
}
