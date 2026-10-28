// Which runs may approve or reject pending approvals (AIO-241). Only a message a
// person typed decides: an automation's or a task's text may come from outside
// data or a model, so "כן 1234" there must not approve someone's request.
import { APPROVAL_ERROR_MESSAGES_HE } from "../../_shared/carmen/approvals/error-messages.ts";

/** The tools that approve or reject a pending approval. */
export const APPROVAL_DECISION_TOOLS: readonly string[] = Object.freeze([
  "execute_pending_approval",
  "reject_pending_approval",
]);

/**
 * Surfaces where a person typed the message Carmen answers. A task run
 * (run-agent-task, subagents, the tasks screen) answers a task's text, which a
 * model or an automation may have written, so it never decides approvals.
 */
export const APPROVAL_DECISION_SURFACES: readonly string[] = Object.freeze([
  "internal_chat",
  "aios",
  "whatsapp",
  "grok_bot",
]);

/** What a decision tool returns in a run that may not decide approvals. */
export type ApprovalDecisionRefusal = {
  success: false;
  error: "approval_not_allowed_in_automation" | "approval_not_allowed_in_task";
  message: string;
};

/**
 * Whether this run may approve or reject pending approvals: the chat fast path
 * ("כן", "כן 1234") and the execute/reject tools. Only when a person typed the
 * message (APPROVAL_DECISION_SURFACES), never in an automation run. `surface` is
 * the one run-ai-agent resolved; without it the body's counts, and a missing one
 * is internal_chat as in run-ai-agent.
 */
export function runMayDecideApprovals(
  body: Record<string, unknown> | null | undefined,
  surface?: string,
): boolean {
  if (isAutomationRun(body)) {
    return false;
  }

  const claimed = surface ?? body?.surface ?? "internal_chat";
  return (
    typeof claimed === "string" && APPROVAL_DECISION_SURFACES.includes(claimed)
  );
}

/**
 * An automation run (trigger-automation sets the top-level automation_id). Carmen's
 * WhatsApp sessions (runCarmenAI in the webhooks) are a person talking to Carmen:
 * they carry the routing automation only inside wa_notify / carmen_automation,
 * never as a top-level automation_id, so they are not automation runs.
 */
export function isAutomationRun(
  body: Record<string, unknown> | null | undefined,
): boolean {
  const id = body?.automation_id;
  return typeof id === "string" ? id.trim() !== "" : !!id;
}

/**
 * The tools a run may show the model: without the approval decisions when the
 * run may not decide them, so the model neither tries them nor relays a refusal.
 */
export function approvalScopedTools<T extends { name?: string }>(
  tools: T[],
  mayDecide: boolean,
): T[] {
  if (mayDecide || !Array.isArray(tools)) {
    return tools;
  }

  return tools.filter((t) => !isApprovalDecisionTool(t?.name));
}

/**
 * The tool result when a run that may not decide approvals calls a decision
 * tool, else null.
 */
export function approvalDecisionRefusal(
  toolName: string,
  body: Record<string, unknown> | null | undefined,
  surface?: string,
): ApprovalDecisionRefusal | null {
  if (
    !isApprovalDecisionTool(toolName) ||
    runMayDecideApprovals(body, surface)
  ) {
    return null;
  }

  const error = isAutomationRun(body)
    ? "approval_not_allowed_in_automation"
    : "approval_not_allowed_in_task";
  return {
    success: false,
    error,
    message: `לא בוצע כלום. ${APPROVAL_ERROR_MESSAGES_HE[error]} ${APPROVAL_ELSEWHERE}`,
  };
}

/** Is this one of the tools that approve or reject a pending approval? */
export function isApprovalDecisionTool(name: unknown): boolean {
  return typeof name === "string" && APPROVAL_DECISION_TOOLS.includes(name);
}

const APPROVAL_ELSEWHERE =
  'מאשרים בשיחה עם כרמן ("כן" ואחריו הקוד) או במסך האישורים.';
