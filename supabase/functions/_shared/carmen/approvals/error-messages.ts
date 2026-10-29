/**
 * Approval error codes (carmen-approval-execute, resume-agent-run, chat picker) in
 * the words the user sees. Carmen's chat replies and the approvals screen both read it.
 */
export const APPROVAL_ERROR_MESSAGES_HE: Readonly<Record<string, string>> =
  Object.freeze({
    approver_role_required: "הפעולה הזו דורשת אישור של בעלים או מנהל/ת סוכנות",
    not_requester: "רק מי שביקש את הפעולה או מנהל/ת יכולים להחליט עליה",
    approver_required: "לא זוהה משתמש מאשר",
    no_identity: "לא זוהה משתמש מאשר",
    approval_not_found: "הבקשה לא נמצאה",
    expired: "פג תוקף הבקשה",
    in_progress: "הבקשה כבר בביצוע",
    not_pending: "הבקשה כבר טופלה",
    "approval already decided": "הבקשה כבר טופלה",
    rejected: "הבקשה נדחתה קודם",
    unknown_tool: "אין מנגנון ביצוע לפעולה הזו",
    // 401 from the edge function: the browser session is no longer valid.
    unauthorized: "צריך להתחבר מחדש",
    // run-ai-agent decision tools in a run no person typed (AIO-241).
    approval_not_allowed_in_automation:
      "אוטומציה לא מאשרת ולא דוחה בקשות ממתינות.",
    approval_not_allowed_in_task: "משימה לא מאשרת ולא דוחה בקשות ממתינות.",
  });
