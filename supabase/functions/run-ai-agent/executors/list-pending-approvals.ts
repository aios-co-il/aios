import type { ListPendingApprovalsArgs } from "./approval-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { loadApprovalPick } from "../approvals/pick.ts";
import { approvalDisplayCode } from "../approvals/codes.ts";

/** Preserves the existing list_pending_approvals executor and side-effect order. */
export async function executeListPendingApprovals(
  args: ListPendingApprovalsArgs,
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

  // Only requests this caller may approve, each with the short code for "כן <קוד>".
  const pick = await loadApprovalPick(supabase, tenantId, {
    userId: actorUserId,
    surface,
    conversationId,
    waChatId: waNotify?.chat_id as string | null | undefined,
    phone: callerPhone,
  });
  const approvals = pick.pickable.slice(0, args.limit || 10).map((r) => ({
    code: approvalDisplayCode(r, pick.pickable),
    id: r.id,
    title: r.title,
    description: r.description,
    tool_name: r.tool_name,
    created_at: r.created_at,
    requested_by: r.requested_by,
    mine: r.requested_by === actorUserId,
  }));
  const bound = pick.kind === "match" ? pick.row : null;
  return {
    count: approvals.length,
    approvals,
    bound_approval_id: bound?.id || null,
    instruction_for_carmen: bound
      ? `כשהמשתמש מאשר ("כן"/"מאשר") — קראי ל-execute_pending_approval עם approval_id=${bound.id}. אל תיצרי בקשה חדשה.`
      : 'ל"כן" לבד אין בקשה אחת של המשתמש בשיחה הזו. כדי לאשר בקשה מהרשימה, המשתמש עונה "כן" ואחריו הקוד (למשל "כן 1234").',
  };
}
