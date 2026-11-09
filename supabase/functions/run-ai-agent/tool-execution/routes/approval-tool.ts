import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeListPendingApprovals } from "../../executors/list-pending-approvals.ts";
import { executeExecutePendingApproval } from "../../executors/execute-pending-approval.ts";
import { executeRejectPendingApproval } from "../../executors/reject-pending-approval.ts";

/** approval-tool tool routes; argument assertions retain the legacy tool boundary. */
export const approvalToolRoutes: Record<string, ToolRoute> = {
  list_pending_approvals: bindToolRoute(executeListPendingApprovals),
  execute_pending_approval: bindToolRoute(executeExecutePendingApproval),
  reject_pending_approval: bindToolRoute(executeRejectPendingApproval),
};
