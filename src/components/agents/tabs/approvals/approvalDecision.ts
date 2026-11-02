// AIO-230: which edge function decides an approvals-screen row, and what the user sees.
import { APPROVAL_ERROR_MESSAGES_HE } from "../../../../../supabase/functions/_shared/carmen/approvals/error-messages.ts";

export type ApprovalDecision = "approve" | "reject";

export type ApprovalEndpoint = "carmen-approval-execute" | "resume-agent-run";

export interface ApprovalRowRef {
  id: string;
  run_id?: string | null;
}

export interface ApprovalOutcome {
  ok: boolean;
  message: string;
}

/** What carmen-approval-execute / resume-agent-run send back (success or error). */
export interface DecisionResponse {
  success?: unknown;
  ok?: unknown;
  rejected?: unknown;
  already_executed?: unknown;
  error?: unknown;
  result?: { error?: unknown; message?: unknown } | null;
  detail?: { error?: unknown } | null;
  executionResult?: { ok?: unknown; error?: unknown } | null;
}

/** Edge function that decides this row: run steps resume, Carmen rows execute. */
export function approvalEndpoint(item: ApprovalRowRef): ApprovalEndpoint {
  return item.run_id ? "resume-agent-run" : "carmen-approval-execute";
}

/** Request body for the decision; the approver is always the signed-in user. */
export function approvalRequestBody(
  item: ApprovalRowRef,
  decision: ApprovalDecision,
): Record<string, string> {
  if (approvalEndpoint(item) === "resume-agent-run") {
    return {
      approval_id: item.id,
      decision: decision === "approve" ? "approved" : "rejected",
    };
  }

  return decision === "approve"
    ? { approval_id: item.id }
    : { approval_id: item.id, decision: "reject" };
}

/** Turn an edge-function response body (success or error) into what the user sees. */
export function approvalOutcome(
  decision: ApprovalDecision,
  body: DecisionResponse | null,
): ApprovalOutcome {
  const b = body ?? {};
  if (decision === "reject") {
    if (b.success === true || b.rejected === true || b.ok === true) {
      return { ok: true, message: "הבקשה נדחתה" };
    }

    return { ok: false, message: approvalErrorMessage(errorFrom(b)) };
  }

  if (b.already_executed === true) {
    return { ok: true, message: "הבקשה כבר בוצעה קודם" };
  }

  if (b.success === true) {
    return { ok: true, message: "אושר ובוצע" };
  }

  // resume-agent-run: { ok, executionResult }
  if (b.ok === true && b.executionResult?.ok !== false) {
    return { ok: true, message: "אושר ובוצע" };
  }

  return { ok: false, message: approvalErrorMessage(errorFrom(b)) };
}

/** The Hebrew message for an error code; unknown codes are shown as they came. */
function approvalErrorMessage(code: string | null): string {
  if (!code) {
    return "הביצוע נכשל";
  }

  return APPROVAL_ERROR_MESSAGES_HE[code] ?? `הביצוע נכשל: ${code}`;
}

/** The first error text in the response, wherever the function put it. */
function errorFrom(body: DecisionResponse): string | null {
  return (
    text(body.error) ||
    text(body.result?.error) ||
    text(body.result?.message) ||
    text(body.detail?.error) ||
    text(body.executionResult?.error) ||
    null
  );
}

/** A non-blank string, trimmed; null otherwise. */
function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
}
