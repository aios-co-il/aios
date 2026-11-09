import type { RejectPendingApprovalArgs } from "./approval-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import { postApprovalDecision } from "../approvals/executor.ts";

/** Preserves the existing reject_pending_approval executor and side-effect order. */
export async function executeRejectPendingApproval(
  args: RejectPendingApprovalArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, actorUserId } = context;

  // AIO-230: carmen-approval-execute rejects only an undecided row, and only for
  // its requester or an approver in the row's tenant.
  const approvalId = asUuidOrNull(args.approval_id);
  const { data: own, error: ownError } = approvalId
    ? await supabase
        .from("agent_approval_queue")
        .select("id")
        .eq("id", approvalId)
        .eq("tenant_id", tenantId)
        .maybeSingle()
    : { data: null, error: null };
  if (ownError) {
    throw ownError;
  }

  if (!own) {
    return {
      success: false,
      error: "approval_not_found",
      approval_id: args.approval_id ?? null,
    };
  }

  const r = await postApprovalDecision({
    approval_id: approvalId,
    approved_by: actorUserId,
    decision: "reject",
    reason: args.reason || null,
  });
  if (r.ok && r.json?.success === true) {
    return { success: true, approval_id: approvalId, status: "rejected" };
  }

  return {
    success: false,
    approval_id: approvalId,
    error: r.json?.error || `reject_failed_${r.status}`,
    status: r.json?.status ?? null,
  };
}
