export type ListPendingApprovalsArgs = { limit?: number };

export type ExecutePendingApprovalArgs = {
  approval_id?: string;
  tool_name?: string;
};

export type RejectPendingApprovalArgs = {
  approval_id: string;
  reason?: string;
};
