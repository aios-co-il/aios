import type { ToolExecutionContext } from "../tool-context.ts";
import { loadApprovalPick } from "../approvals/pick.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import { approvalPickToolResult } from "../approvals/tool-result.ts";
import { runApprovalExecutor } from "../approvals/executor.ts";

type ExecutePendingApprovalArgs = {
  approval_id?: string;
  tool_name?: string;
};

export async function executeExecutePendingApproval(
  args: ExecutePendingApprovalArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    tenantId,
    callerPhone,
    surface,
    conversationId,
    actorUserId,
    waNotify,
  } = context;

  // AIO-230: others' requests are approved by "כן <קוד>" or in the approvals screen.
  const pick = await loadApprovalPick(supabase, tenantId, {
    userId: actorUserId,
    surface,
    conversationId,
    waChatId: waNotify?.chat_id,
    phone: callerPhone,
  });
  const wantedId = asUuidOrNull(args.approval_id);
  if (pick.kind !== "match" || (wantedId && wantedId !== pick.row.id)) {
    return approvalPickToolResult(pick, { requestedId: wantedId });
  }

  const exec = await runApprovalExecutor(pick.row.id, actorUserId);
  return { ...exec, title: pick.row.title || exec.title || null };
}
