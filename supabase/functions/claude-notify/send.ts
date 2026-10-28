/**
 * The send step of claude-notify: refuse (and log) a plan with no recipient,
 * line or sender; otherwise post the message to the chosen sender function and
 * report the real outcome. A Green API send is labelled green_fallback and
 * warned about, so it is never silent.
 */

import {
  postWaSend,
  type WaSendOutcome,
  type WaSendStatus,
} from "../_shared/whatsapp/send-result.ts";
import type { TenantNotifyPlan } from "./plan.ts";

export type NotifySendStatus =
  WaSendStatus | "no_recipient" | "no_transport" | "no_sender";

export type NotifySendDeps = {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl: typeof fetch;
  logger: Pick<Console, "warn" | "error">;
};

/** Sends the message as planned and returns the response body: the real outcome, or why nothing was sent. */
export async function sendNotify(
  deps: NotifySendDeps,
  plan: TenantNotifyPlan,
  message: string,
): Promise<Record<string, unknown>> {
  const { target, delivery, transport, senderUserId } = plan;
  if (!delivery) {
    return refusal(
      deps.logger,
      plan,
      "no_recipient",
      target.reason ||
        "no resolvable Carmen WhatsApp recipient for this tenant",
    );
  }
  if (!transport.functionName) {
    return refusal(
      deps.logger,
      plan,
      "no_transport",
      `no Carmen WhatsApp send step on a primary Carmen line for this tenant (${transport.reason})`,
    );
  }
  if (!senderUserId) {
    return refusal(
      deps.logger,
      plan,
      "no_sender",
      "no connection user to send as on the tenant's Carmen line",
    );
  }
  warnOnGreenFallback(deps.logger, plan);

  const outcome = await postWaSend({
    fetchImpl: deps.fetchImpl,
    supabaseUrl: deps.supabaseUrl,
    serviceRoleKey: deps.serviceRoleKey,
    functionName: transport.functionName,
    body: {
      tenantId: plan.tenantId,
      senderUserId,
      phoneNumber: delivery.phoneNumber,
      message,
      // A staff notification, never logged on a client card (AIO-242).
      sendKind: "staff_alert",
      ...(transport.integrationId
        ? { integrationId: transport.integrationId }
        : {}),
    },
  });
  if (!outcome.sent) {
    logNotConfirmed(deps.logger, plan, outcome);
  }
  return {
    ok: outcome.sent,
    sent: outcome.sent,
    status: outcome.status,
    error: outcome.error,
    message_id: outcome.providerMessageId,
    ...planMeta(plan),
    chat_id: delivery.chatId,
    phone: delivery.phoneNumber,
    contact_name: target.contactName,
  };
}

/**
 * The response body when nothing is sent, and why. Logged as an error because
 * the pg_net callers (claude_notify_david) never read this body.
 */
function refusal(
  logger: NotifySendDeps["logger"],
  plan: TenantNotifyPlan,
  status: NotifySendStatus,
  error: string,
): Record<string, unknown> {
  logger.error("[claude-notify] nothing sent", {
    tenantId: plan.tenantId,
    status,
    error,
    transportReason: plan.transport.reason,
    skipped: plan.transport.skipped,
  });
  return {
    ok: false,
    sent: false,
    status,
    error,
    reason: error,
    ...planMeta(plan),
    chat_id: plan.delivery?.chatId ?? null,
  };
}

/** Which step, line and recipient source the plan used. */
function planMeta(plan: TenantNotifyPlan) {
  return {
    transport: plan.transport.transport,
    automation_id: plan.transport.automationId,
    integration_id: plan.transport.integrationId,
    source: plan.target.source,
  };
}

/** A Green API send is allowed only as a labelled, logged fallback. */
function warnOnGreenFallback(
  logger: NotifySendDeps["logger"],
  plan: TenantNotifyPlan,
): void {
  if (plan.transport.transport !== "green_fallback") {
    return;
  }
  logger.warn(
    "[claude-notify] green_fallback: no Carmen Manus step resolves to an active primary line; sending from the Green API line",
    {
      tenantId: plan.tenantId,
      automationId: plan.transport.automationId,
      reason: plan.transport.reason,
    },
  );
}

/** Logs a send that did not confirm delivery. */
function logNotConfirmed(
  logger: NotifySendDeps["logger"],
  plan: TenantNotifyPlan,
  outcome: WaSendOutcome,
): void {
  logger.error("[claude-notify] send not confirmed", {
    tenantId: plan.tenantId,
    transport: plan.transport.transport,
    status: outcome.status,
    httpStatus: outcome.httpStatus,
    error: outcome.error?.slice(0, 300),
  });
}
