import type { ExecutePendingApprovalArgs } from "./approval-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { loadApprovalPick } from "../approvals/pick.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import { approvalPickToolResult } from "../approvals/tool-result.ts";
import { runApprovalExecutor } from "../approvals/executor.ts";

/** Preserves the existing execute_pending_approval executor and side-effect order. */
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
    waChatId: waNotify?.chat_id as string | null | undefined,
    phone: callerPhone,
  });
  const wantedId = asUuidOrNull(args.approval_id);
  if (pick.kind !== "match" || (wantedId && wantedId !== pick.row.id)) {
    return approvalPickToolResult(pick, { requestedId: wantedId });
  }

  const exec = await runApprovalExecutor(pick.row.id, actorUserId);
  return { ...exec, title: pick.row.title || exec.title || null };
}
