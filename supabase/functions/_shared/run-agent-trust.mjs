// What a run-ai-agent request may say about who is calling (AIO-230).
//
// Carmen resolves the caller from lead_data.phone (phone → campaigners → profiles),
// and that match wins over the JWT user. Approvals are bound to that identity and
// gated on its role, so a signed-in browser user must not be able to name a phone,
// a WhatsApp chat to deliver to, or the whatsapp surface. Only service callers set
// them: runCarmenAI (WhatsApp webhooks), trigger-automation and run-agent-task.
// The browser never sends these fields; every in-app surface is internal_chat, aios
// or task.

/** Request fields only service-to-service callers may set. */
export const SERVICE_ONLY_RUN_FIELDS = Object.freeze([
  // Per-task engine override (agent_tasks.engine_model).
  "model_override",
  // Admin-authored per-automation Carmen instructions.
  "carmen_automation",
  // Caller identity: lead_data.phone resolves the campaigner Carmen acts for.
  "lead_data",
  // WhatsApp delivery target for subagent results and reminders.
  "wa_notify",
]);

/**
 * Bind a run-ai-agent request body to the verified caller, in place.
 * A user JWT always runs as that user, without the service-only fields, and never
 * on the whatsapp surface. Service callers keep the body as sent.
 * @param {Record<string, any>} body
 * @param {{ kind: 'user'|'service', userId: string|null }} auth
 */
export function bindRunAgentCaller(body, auth) {
  if (!body || typeof body !== "object") return body;
  if (auth?.kind === "service") return body;
  body.user_id = auth?.kind === "user" ? auth.userId : null;
  for (const field of SERVICE_ONLY_RUN_FIELDS) delete body[field];
  if (body.surface === "whatsapp") body.surface = "internal_chat";
  return body;
}

// ── Automation runs (AIO-241) ────────────────────────────────────────────────
//
// trigger-automation calls run-ai-agent with the service key, so the body above is
// kept as sent. The caller that started the automation run decides what that body
// may say about identity. Provider webhooks (WhatsApp inbound, lead intake) call
// trigger-automation with the service key and are the source of a phone identity.
// A signed-in user can fire any trigger type with data they choose, so a run they
// start must not name a caller phone, a WhatsApp target or a display name.

/**
 * Who started a trigger-automation run, as its request auth proved it.
 * @typedef {{ kind: 'service' } | { kind: 'user', userId: string }} AutomationRunCaller
 */

/**
 * Bind trigger-automation's run-ai-agent body to the caller that started the run,
 * in place. A service-started run keeps the body. A user-started run runs as that
 * user (user_id), with no caller phone (lead_data.phone is kept as contact_phone,
 * which is lead context and never resolves an identity), no WhatsApp target and no
 * payload display name. An unknown caller gets no identity at all.
 * @param {Record<string, any>} body
 * @param {AutomationRunCaller | null | undefined} caller
 */
export function bindAutomationAgentCaller(body, caller) {
  if (!body || typeof body !== "object") return body;
  if (caller?.kind === "service") return body;
  body.user_id =
    caller?.kind === "user" &&
    typeof caller.userId === "string" &&
    caller.userId
      ? caller.userId
      : null;
  body.invoked_by_user = true;
  delete body.user_name;
  delete body.wa_notify;
  delete body.carmen_automation;
  if (body.surface === "whatsapp") body.surface = "internal_chat";
  if (body.lead_data && typeof body.lead_data === "object") {
    const { phone, ...rest } = body.lead_data;
    body.lead_data = phone ? { ...rest, contact_phone: phone } : rest;
  } else {
    delete body.lead_data;
  }
  return body;
}

/**
 * The phone run-ai-agent resolves the caller from (phone → campaigner → profile),
 * which wins over user_id. Only lead_data.phone counts; contact_phone is context.
 * @param {Record<string, any> | null | undefined} body
 * @returns {string | null}
 */
export function runCallerPhone(body) {
  const phone = body?.lead_data?.phone;
  if (phone === null || phone === undefined) return null;
  const text = String(phone).trim();
  return text ? text : null;
}

/** Approval decisions an automation run never makes. */
export const APPROVAL_DECISION_TOOLS = Object.freeze([
  "execute_pending_approval",
  "reject_pending_approval",
]);

/**
 * An automation run (trigger-automation sets the top-level automation_id). Carmen's
 * WhatsApp sessions (runCarmenAI in the webhooks) are a person talking to Carmen:
 * they carry the routing automation only inside wa_notify / carmen_automation,
 * never as a top-level automation_id, so they are not automation runs.
 * @param {Record<string, any> | null | undefined} body
 */
export function isAutomationRun(body) {
  const id = body?.automation_id;
  return typeof id === "string" ? id.trim() !== "" : !!id;
}

/**
 * Whether this run may approve or reject pending approvals: the chat fast path
 * ("כן", "כן 1234") and the execute/reject tools. Never in an automation run.
 * @param {Record<string, any> | null | undefined} body
 */
export function runMayDecideApprovals(body) {
  return !isAutomationRun(body);
}

/** The tool result when an automation run tries to decide an approval, else null. */
export function automationApprovalRefusal(toolName) {
  if (!APPROVAL_DECISION_TOOLS.includes(toolName)) return null;
  return {
    success: false,
    error: "approval_not_allowed_in_automation",
    message:
      'לא בוצע כלום. אוטומציה לא מאשרת ולא דוחה בקשות ממתינות. מאשרים בשיחה עם כרמן ("כן" ואחריו הקוד) או במסך האישורים.',
  };
}
