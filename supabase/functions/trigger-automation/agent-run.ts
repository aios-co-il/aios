// The run-ai-agent request trigger-automation sends for a run (AIO-241): checked
// against the user who started it, and stripped of any identity the payload names.
import { internalBrainRefusal } from "../_shared/carmen/brain-guard.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { AutomationRunCaller } from "./run-caller.ts";

/** A run-ai-agent request body; lead_data is the lead the run is about. */
type AgentRunBody = Record<string, unknown> & {
  lead_data?: Record<string, unknown>;
};

/**
 * The run-ai-agent body to send, bound to who the run acts for, or the refusal
 * when the user who started the run may not run Carmen's main brain.
 */
export async function prepareAgentRun(
  sb: Pick<DbClient, "from">,
  caller: AutomationRunCaller | null,
  target: { tenantId?: unknown; agentId?: unknown },
  body: AgentRunBody,
): Promise<{ refusal: string } | { body: AgentRunBody }> {
  const refusal = await internalBrainRefusal(sb, caller, target);
  if (refusal) {
    return { refusal };
  }

  return { body: bindAutomationAgentCaller(body, caller) };
}

/**
 * Bind a run-ai-agent body to who the run acts for, in place. A WhatsApp-inbound
 * run keeps the body. Every other run has no caller phone (lead_data.phone is kept
 * as contact_phone, which is lead context and never resolves an identity), no
 * WhatsApp target and no payload display name; a user-started run runs as that
 * user (user_id), any other run as no one.
 */
export function bindAutomationAgentCaller(
  body: AgentRunBody,
  caller: AutomationRunCaller | null,
): AgentRunBody {
  if (!body || typeof body !== "object") {
    return body;
  }

  if (caller?.kind === "whatsapp_inbound") {
    return body;
  }

  body.user_id =
    caller?.kind === "user" && caller.userId ? caller.userId : null;
  delete body.user_name;
  delete body.wa_notify;
  delete body.carmen_automation;
  if (body.surface === "whatsapp") {
    body.surface = "internal_chat";
  }

  if (body.lead_data && typeof body.lead_data === "object") {
    const { phone, ...rest } = body.lead_data;
    body.lead_data = phone ? { ...rest, contact_phone: phone } : rest;
  } else {
    delete body.lead_data;
  }

  return body;
}
