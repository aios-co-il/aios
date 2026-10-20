/** Re-export for Deno edge functions. Implementation in .mjs (Node-testable). */
export {
  META_APPROVAL_TOOLS,
  normalizeApprovalText,
  isExplicitApprovalPhrase,
  isExplicitRejectionPhrase,
  isMetaApprovalTool,
  pickLatestPendingApproval,
  approvalBelongsToCaller,
  filterApprovalsForCaller,
  buildNoPendingRecovery,
  buildApprovalConfirmPromptRule,
  formatApprovalExecutionReply,
  buildApprovalFlowAcceptanceCases,
} from "./wa-approval-flow.mjs";
