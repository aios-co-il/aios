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
// kept as sent. Who started the automation run decides what that body may say about
// identity. A signed-in user can fire any trigger type with data they choose, and
// most service-started runs carry outside data too: a lead form, a flow webhook
// body (members can read and edit its secret), a lead's phone. Only a WhatsApp
// provider webhook relays a message whose sender WhatsApp itself verified.

/**
 * Trigger types a WhatsApp provider webhook (green-api-webhook) sends to
 * trigger-automation with the service key. Their payload names the real sender.
 */
export const WHATSAPP_INBOUND_TRIGGER_TYPES = Object.freeze([
  "whatsapp_message_received",
]);

/**
 * Who a trigger-automation run acts for:
 * - `{ kind: 'user', userId }`: a signed-in user started it; Carmen runs as them.
 * - `{ kind: 'whatsapp_inbound' }`: a WhatsApp provider webhook relayed a message;
 *   the payload's phone is the sender.
 * - `null`: anyone else (lead intake, flow webhooks, cron, other functions). The
 *   payload is outside data, never the caller, so the run has no identity.
 * @typedef {{ kind: 'user', userId: string } | { kind: 'whatsapp_inbound' }} AutomationRunCaller
 */

/**
 * The AutomationRunCaller for a trigger-automation request, from the caller its
 * auth check proved (`{ kind: 'service' }` or `{ kind: 'user', userId }`).
 * A service request counts as WhatsApp-inbound only for a WhatsApp-inbound
 * trigger type without `automationId`: flow webhooks and lead intake run a chosen
 * automation by id, and set the payload from what their caller posted.
 * @param {Record<string, any> | null | undefined} requestBody
 * @param {{ kind: string, userId?: string | null } | null | undefined} caller
 * @returns {AutomationRunCaller | null}
 */
export function automationRunCaller(requestBody, caller) {
  if (caller?.kind === "user")
    return typeof caller.userId === "string" && caller.userId
      ? { kind: "user", userId: caller.userId }
      : null;
  if (caller?.kind !== "service") return null;
  if (requestBody?.automationId) return null;
  return WHATSAPP_INBOUND_TRIGGER_TYPES.includes(requestBody?.trigger_type)
    ? { kind: "whatsapp_inbound" }
    : null;
}

/**
 * Bind trigger-automation's run-ai-agent body to who the run acts for, in place.
 * A WhatsApp-inbound run keeps the body. Every other run has no caller phone
 * (lead_data.phone is kept as contact_phone, which is lead context and never
 * resolves an identity), no WhatsApp target and no payload display name; a
 * user-started run runs as that user (user_id), any other run as no one.
 * @param {Record<string, any>} body
 * @param {AutomationRunCaller | null | undefined} caller
 */
export function bindAutomationAgentCaller(body, caller) {
  if (!body || typeof body !== "object") return body;
  if (caller?.kind === "whatsapp_inbound") return body;
  const userId =
    caller?.kind === "user" &&
    typeof caller.userId === "string" &&
    caller.userId
      ? caller.userId
      : null;
  body.user_id = userId;
  if (userId) body.invoked_by_user = true;
  else delete body.invoked_by_user;
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

// ── Approval decisions ───────────────────────────────────────────────────────

/** The tools that approve or reject a pending approval. */
export const APPROVAL_DECISION_TOOLS = Object.freeze([
  "execute_pending_approval",
  "reject_pending_approval",
]);

/**
 * Surfaces where a person typed the message Carmen answers. A task run
 * (run-agent-task, subagents, the tasks screen) answers a task's text, which a
 * model or an automation may have written, so it never decides approvals.
 */
export const APPROVAL_DECISION_SURFACES = Object.freeze([
  "internal_chat",
  "aios",
  "whatsapp",
  "grok_bot",
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
 * ("כן", "כן 1234") and the execute/reject tools. Only when a person typed the
 * message (APPROVAL_DECISION_SURFACES), never in an automation run.
 * @param {Record<string, any> | null | undefined} body
 * @param {string} [surface] the surface run-ai-agent resolved; defaults to the
 *   body's, and a missing one is internal_chat as in run-ai-agent.
 */
export function runMayDecideApprovals(body, surface) {
  if (isAutomationRun(body)) return false;
  return APPROVAL_DECISION_SURFACES.includes(
    surface ?? body?.surface ?? "internal_chat",
  );
}

/**
 * The tools a run may show the model: without the approval decisions when the
 * run may not decide them, so the model neither tries them nor relays a refusal.
 * @template {{ name?: string }} T
 * @param {T[]} tools
 * @param {boolean} mayDecide
 * @returns {T[]}
 */
export function approvalScopedTools(tools, mayDecide) {
  if (mayDecide || !Array.isArray(tools)) return tools;
  return tools.filter((t) => !APPROVAL_DECISION_TOOLS.includes(t?.name));
}

const APPROVAL_ELSEWHERE =
  'מאשרים בשיחה עם כרמן ("כן" ואחריו הקוד) או במסך האישורים.';

/**
 * The tool result when a run that may not decide approvals calls a decision
 * tool, else null.
 * @param {string} toolName
 * @param {Record<string, any> | null | undefined} body
 * @param {string} [surface]
 */
export function approvalDecisionRefusal(toolName, body, surface) {
  if (!APPROVAL_DECISION_TOOLS.includes(toolName)) return null;
  if (runMayDecideApprovals(body, surface)) return null;
  return isAutomationRun(body)
    ? {
        success: false,
        error: "approval_not_allowed_in_automation",
        message: `לא בוצע כלום. אוטומציה לא מאשרת ולא דוחה בקשות ממתינות. ${APPROVAL_ELSEWHERE}`,
      }
    : {
        success: false,
        error: "approval_not_allowed_in_task",
        message: `לא בוצע כלום. משימה לא מאשרת ולא דוחה בקשות ממתינות. ${APPROVAL_ELSEWHERE}`,
      };
}
