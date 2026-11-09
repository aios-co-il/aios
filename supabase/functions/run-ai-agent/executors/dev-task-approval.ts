import { findOfferedDevTask } from "../dev-task-offer.ts";
import { devTaskApprovalDecision } from "../../_shared/dev-task-approval.ts";
import type { AgentDatabaseClient } from "../database-contracts.ts";

/**
 * Why approve_dev_task / dispatch_dev_task may not act on this task now, in any chat (the user's
 * yes in an AIOS chat must answer Carmen's previous message, which offered this task), or null
 * when it may. A call with no user turn (a service or out-of-band call) is never a yes.
 */
export async function devTaskApprovalRefusal(
  supabase: AgentDatabaseClient,
  tenantId: string,
  taskId: string,
  conversationId: string | null,
  turn:
    | { turnStartedAt: string; appChatUser: boolean; lastAssistantText: string }
    | null
    | undefined,
  userText: string | null,
  approver: { id: string | null; tier: "full" | "bugfix" | null },
): Promise<{ error: string; message: string } | null> {
  const gate = turn ?? {
    turnStartedAt: "",
    appChatUser: false,
    lastAssistantText: "",
  };
  const { data: task } = await supabase
    .from("dev_tasks")
    .select(
      "id, status, created_at, assigned_agent, requested_by_user_id, source_conversation_id",
    )
    .eq("id", taskId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const offered = conversationId
    ? await findOfferedDevTask(supabase, {
        tenantId,
        conversationId,
        turnStartedAt: gate.turnStartedAt,
      })
    : null;
  const decision = devTaskApprovalDecision({
    task: task ?? null,
    appChatUser: gate.appChatUser,
    userText,
    turnStartedAt: gate.turnStartedAt,
    conversationId,
    lastAssistantText: gate.lastAssistantText,
    offeredTaskId: offered?.id ?? null,
    approver,
  });
  return decision.ok
    ? null
    : {
        error: `dev_task_approval_${decision.reason}`,
        message: decision.message,
      };
}
