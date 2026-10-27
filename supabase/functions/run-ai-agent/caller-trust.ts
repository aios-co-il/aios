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
export const SERVICE_ONLY_RUN_FIELDS: readonly string[] = Object.freeze([
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
 */
export function bindRunAgentCaller(
  body: Record<string, unknown>,
  auth: { kind: "user" | "service"; userId: string | null } | null,
): Record<string, unknown> {
  if (!body || typeof body !== "object") {
    return body;
  }

  if (auth?.kind === "service") {
    return body;
  }

  body.user_id = auth?.kind === "user" ? auth.userId : null;
  for (const field of SERVICE_ONLY_RUN_FIELDS) {
    delete body[field];
  }

  if (body.surface === "whatsapp") {
    body.surface = "internal_chat";
  }

  return body;
}
