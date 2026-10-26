// Approvals screen → which edge function decides a row, and what to tell the user (AIO-230).
//
// Carmen's own approvals (no run_id: Meta / Google, accounting, automations, broadcasts,
// schedules, direct agent tools) execute in carmen-approval-execute, which checks the
// approver's tenant and role, expiry, and claims the row once. Only run-ai-agent-v2 run
// steps (run_id set) resume through resume-agent-run. Neither flips the status first.

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

export function approvalEndpoint(item: ApprovalRowRef): ApprovalEndpoint {
  return item.run_id ? "resume-agent-run" : "carmen-approval-execute";
}

export function approvalRequestBody(
  item: ApprovalRowRef,
  decision: ApprovalDecision,
): Record<string, string> {
  if (approvalEndpoint(item) === "resume-agent-run")
    return {
      approval_id: item.id,
      decision: decision === "approve" ? "approved" : "rejected",
    };
  return decision === "approve"
    ? { approval_id: item.id }
    : { approval_id: item.id, decision: "reject" };
}

const ERROR_MESSAGES: Record<string, string> = {
  approver_role_required: "הפעולה הזו דורשת אישור של בעלים או מנהל/ת סוכנות",
  not_requester: "רק מי שביקש את הפעולה או מנהל/ת יכולים להחליט עליה",
  approver_required: "לא זוהה משתמש מאשר",
  no_identity: "לא זוהה משתמש מאשר",
  approval_not_found: "הבקשה לא נמצאה",
  expired: "פג תוקף הבקשה, ולכן היא לא בוצעה",
  in_progress: "הבקשה כבר בביצוע",
  not_pending: "הבקשה כבר טופלה",
  "approval already decided": "הבקשה כבר טופלה",
  rejected: "הבקשה נדחתה קודם",
  unknown_tool: "אין מנגנון ביצוע לפעולה הזו",
  unauthorized: "צריך להתחבר מחדש",
};

/** What carmen-approval-execute / resume-agent-run send back (success or error). */
interface DecisionResponse {
  success?: unknown;
  ok?: unknown;
  rejected?: unknown;
  already_executed?: unknown;
  error?: unknown;
  result?: { error?: unknown; message?: unknown } | null;
  detail?: { error?: unknown } | null;
  executionResult?: { ok?: unknown; error?: unknown } | null;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

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

export function approvalErrorMessage(code: string | null): string {
  if (!code) return "הביצוע נכשל";
  return ERROR_MESSAGES[code] ?? `הביצוע נכשל: ${code}`;
}

/** Turn an edge-function response body (success or error) into what the user sees. */
export function approvalOutcome(
  decision: ApprovalDecision,
  body: unknown,
): ApprovalOutcome {
  const b: DecisionResponse =
    body && typeof body === "object" ? (body as DecisionResponse) : {};
  if (decision === "reject") {
    if (b.success === true || b.rejected === true || b.ok === true)
      return { ok: true, message: "הבקשה נדחתה" };
    return { ok: false, message: approvalErrorMessage(errorFrom(b)) };
  }
  if (b.already_executed === true)
    return { ok: true, message: "הבקשה כבר בוצעה קודם" };
  if (b.success === true) return { ok: true, message: "אושר ובוצע" };
  // resume-agent-run: { ok, executionResult }
  if (b.ok === true && b.executionResult?.ok !== false)
    return { ok: true, message: "אושר ובוצע" };
  return { ok: false, message: approvalErrorMessage(errorFrom(b)) };
}
