// Who a trigger-automation run acts for when it runs Carmen (AIO-241).
//
// trigger-automation calls run-ai-agent with the service key, so run-ai-agent keeps
// whatever the body says about identity. A signed-in user can fire any trigger type
// with data they choose, and most service-started runs carry outside data too: a
// lead form, a flow webhook body (members can read and edit its secret), a lead's
// phone. Only a WhatsApp provider webhook relays a message whose sender WhatsApp
// itself verified.
import type { RunCaller } from "../_shared/automation-run-auth.ts";

/**
 * Who a run acts for: a signed-in user who started it (Carmen runs as them), or a
 * message a WhatsApp provider webhook relayed (the payload's phone is the sender).
 * Any other run (lead intake, flow webhooks, cron, other functions) acts for no
 * one, written `null`: its payload is outside data, never the caller.
 */
export type AutomationRunCaller =
  { kind: "user"; userId: string } | { kind: "whatsapp_inbound" };

/**
 * The AutomationRunCaller for a trigger-automation request, from the caller its
 * auth check proved. A service request counts as WhatsApp-inbound only for a
 * WhatsApp-inbound trigger type without `automationId`: flow webhooks and lead
 * intake run a chosen automation by id, and set the payload from what their
 * caller posted.
 */
export function automationRunCaller(
  requestBody: Record<string, unknown> | null,
  caller: RunCaller | null,
): AutomationRunCaller | null {
  if (caller?.kind === "user") {
    return caller.userId ? { kind: "user", userId: caller.userId } : null;
  }

  if (caller?.kind !== "service" || requestBody?.automationId) {
    return null;
  }

  const triggerType = requestBody?.trigger_type;
  return typeof triggerType === "string" &&
    WHATSAPP_INBOUND_TRIGGER_TYPES.includes(triggerType)
    ? { kind: "whatsapp_inbound" }
    : null;
}

/**
 * Trigger types a WhatsApp provider webhook (green-api-webhook) sends to
 * trigger-automation with the service key. Their payload names the real sender.
 */
export const WHATSAPP_INBOUND_TRIGGER_TYPES: readonly string[] = Object.freeze([
  "whatsapp_message_received",
]);
