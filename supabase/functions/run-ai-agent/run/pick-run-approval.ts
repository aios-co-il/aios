import type { RunState } from "./state.ts";
import { parseApprovalReply } from "../approvals/reply.ts";
import { loadApprovalPick } from "../approvals/pick.ts";
import { buildApprovalPickPromptRule } from "../approvals/chat-text.ts";
/** pick Run Approval in the original run order. */
export async function pickRunApproval(
  run: RunState,
): Promise<Response | string | void> {
  run.approvalConversation = {
    surface: run.input.surface,
    conversationId: run.serverConversationId,
    waChatId: run.wa_notify?.chat_id as string | null | undefined,
    phone: run.callerPhone,
  };
  const approvalReply = parseApprovalReply(String(run.command_text || ""));
  run.userSaidApprove = !run.devTaskOfferAnswered && approvalReply.approve;
  const userSaidReject = !run.devTaskOfferAnswered && approvalReply.reject;
  run.approvalPick = null;
  // A workshop "כן" answers the workshop, never a pending approval; its budget code is
  // approved by workshopTurnNote.
  if (
    run.isCarmen &&
    !run.pinSkillsOnly &&
    !run.inWorkshopRequest &&
    run.mayDecideApprovals &&
    (run.userSaidApprove || userSaidReject)
  ) {
    run.approvalPick = await loadApprovalPick(
      run.supabase,
      run.resolvedTenantId,
      {
        ...run.approvalConversation,
        userId: run.callerUserId,
        code: approvalReply.code,
        mode: run.userSaidApprove ? "approve" : "reject",
      },
    );
    if (run.userSaidApprove) {
      run.systemPrompt += buildApprovalPickPromptRule(run.approvalPick);
    } else if (run.approvalPick.kind === "match") {
      run.systemPrompt += `\n\n🚫 המשתמש דחה. קראי ל-reject_pending_approval עם approval_id=${run.approvalPick.row.id}. אל תבצעי את הפעולה.`;
    }
  }
  run.pendingForConfirm =
    run.approvalPick?.kind === "match" ? run.approvalPick.row : null;
}
