/**
 * Staff alerts leave only from Carmen's own Manus line.
 *
 * sendStaffAlert sends a 1:1 WhatsApp to a staff member through the tenant's
 * active manus_wa integration, via send-manus-wa-message. That sender applies
 * the Staging outbound guard (checkWhatsAppSend) and writes the chat_messages
 * row, so every staff alert is guarded and recorded.
 *
 * It never selects a Green API integration (David's operator phone) and never
 * passes clientId or groupId, so an alert cannot land in a client thread.
 * It returns the real delivery outcome; a 202 "delivery unknown" from Manus is
 * reported as such and never retried on another line.
 */

import { normalizeStaffPhone } from "./staff-whatsapp.mjs";
import { asUuidOrNull } from "./uuid.mjs";
import { readWaSendResponse, type WaSendStatus } from "./wa-send-result.ts";

export const STAFF_ALERT_INTEGRATION_TYPES = ["manus_wa", "manuswa"];
export const STAFF_ALERT_SEND_FUNCTION = "send-manus-wa-message";

export type StaffAlertStatus =
  WaSendStatus | "no_phone" | "no_line" | "no_sender";

export type StaffAlertResult = {
  sent: boolean;
  status: StaffAlertStatus;
  transport: "manus_wa" | null;
  integrationId: string | null;
  providerMessageId: string | null;
  error: string | null;
  phone: string | null;
};

export const STAFF_ALERT_NO_LINE_HE =
  "לא נמצא קו WhatsApp פעיל של כרמן (Manus) בטננט. התראות לצוות נשלחות רק מהקו של כרמן. צריך לחבר את הקו תחת הגדרות ← אינטגרציות.";

type StaffAlertInput = {
  supabase: any;
  supabaseUrl: string;
  serviceRoleKey: string;
  tenantId: string;
  phone: string;
  message: string;
  /** The person Carmen acts for; recorded as sent_by_user_id. */
  requesterUserId?: string | null;
  fetchImpl?: typeof fetch;
};

function result(
  status: StaffAlertStatus,
  fields: Partial<StaffAlertResult> = {},
): StaffAlertResult {
  return {
    sent: status === "sent",
    status,
    transport: null,
    integrationId: null,
    providerMessageId: null,
    error: null,
    phone: null,
    ...fields,
  };
}

async function tenantOwnerId(
  supabase: any,
  tenantId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  return asUuidOrNull(data?.user_id);
}

export async function sendStaffAlert(
  input: StaffAlertInput,
): Promise<StaffAlertResult> {
  const { supabase, tenantId, message } = input;
  const doFetch = input.fetchImpl ?? fetch;
  const phone = normalizeStaffPhone(input.phone);
  if (!phone) return result("no_phone", { error: "מספר טלפון לא תקין" });

  const { data: rows, error: lineError } = await supabase
    .from("tenant_integrations")
    .select("id, user_id, integration_type")
    .eq("tenant_id", tenantId)
    .in("integration_type", STAFF_ALERT_INTEGRATION_TYPES)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(5);
  if (lineError) {
    return result("failed", { phone, error: String(lineError.message) });
  }
  const lines = (rows || []).filter((row: any) =>
    STAFF_ALERT_INTEGRATION_TYPES.includes(String(row?.integration_type)),
  );
  if (!lines.length) {
    return result("no_line", { phone, error: STAFF_ALERT_NO_LINE_HE });
  }

  let ownerId: string | null | undefined;
  let last: StaffAlertResult | null = null;
  for (const line of lines) {
    let senderUserId =
      asUuidOrNull(input.requesterUserId) || asUuidOrNull(line.user_id);
    if (!senderUserId) {
      if (ownerId === undefined)
        ownerId = await tenantOwnerId(supabase, tenantId);
      senderUserId = ownerId;
    }
    if (!senderUserId) {
      last = result("no_sender", {
        phone,
        integrationId: line.id,
        error: "לא נמצא משתמש שולח בטננט עבור קו כרמן",
      });
      continue;
    }

    let outcome;
    try {
      const res = await doFetch(
        `${input.supabaseUrl}/functions/v1/${STAFF_ALERT_SEND_FUNCTION}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.serviceRoleKey}`,
          },
          body: JSON.stringify({
            tenantId,
            integrationId: line.id,
            senderUserId,
            phoneNumber: phone,
            message,
          }),
        },
      );
      outcome = await readWaSendResponse(res);
    } catch (e) {
      outcome = {
        sent: false,
        status: "failed" as const,
        error: e instanceof Error ? e.message : String(e),
        providerMessageId: null,
        httpStatus: null,
      };
    }

    const current = result(outcome.status, {
      transport: "manus_wa",
      integrationId: line.id,
      providerMessageId: outcome.providerMessageId,
      error: outcome.error,
      phone,
    });
    // Only a definite failure may move on to the next Manus line. A send that
    // may have left (delivery_unknown), a Staging block or a duplicate skip
    // must not be repeated.
    if (outcome.status !== "failed") return current;
    last = current;
  }
  return last ?? result("no_line", { phone, error: STAFF_ALERT_NO_LINE_HE });
}

/** Tool-facing shape for send_whatsapp_to_staff / send_message_to_campaigner. */
export function staffAlertToolResult(r: StaffAlertResult): Record<string, any> {
  const common = {
    status: r.status,
    provider: r.transport,
    integration_id: r.integrationId,
  };
  if (r.status === "sent") {
    return { success: true, ...common, message_id: r.providerMessageId };
  }
  if (r.status === "delivery_unknown") {
    return {
      success: true,
      ...common,
      warning:
        "שער Manus לא אישר בזמן. ייתכן שההודעה נמסרה, אל תשלחי אותה שוב.",
    };
  }
  if (r.status === "duplicate_skipped") {
    return {
      success: true,
      ...common,
      warning: "הודעה זהה כבר נשלחה לאחרונה, לא נשלחה שוב.",
    };
  }
  if (r.status === "blocked_staging") {
    return {
      ...common,
      error: "השליחה נחסמה בסביבת Staging: המספר לא ברשימת המספרים המותרים.",
    };
  }
  return { ...common, error: r.error || "שליחה נכשלה" };
}

/** Records the outcome of a staff alert in agent_action_log. Never throws. */
export async function logStaffAlertOutcome(
  supabase: any,
  args: {
    tenantId: string;
    agentId?: string | null;
    userId?: string | null;
    conversationId?: string | null;
    recipient?: {
      entity_type?: string | null;
      id?: string | null;
      full_name?: string | null;
    } | null;
    result: StaffAlertResult;
  },
): Promise<void> {
  const r = args.result;
  try {
    await supabase.from("agent_action_log").insert({
      tenant_id: args.tenantId,
      agent_id: asUuidOrNull(args.agentId),
      user_id: asUuidOrNull(args.userId),
      conversation_id: asUuidOrNull(args.conversationId),
      action_type: "staff_whatsapp_alert",
      status:
        r.status === "sent"
          ? "success"
          : r.status === "delivery_unknown"
            ? "delivery_unknown"
            : "error",
      error_message: r.sent ? null : r.error,
      action_details: {
        recipient_type: args.recipient?.entity_type ?? null,
        recipient_id: args.recipient?.id ?? null,
        recipient_name: args.recipient?.full_name ?? null,
        phone: r.phone,
        delivery_status: r.status,
        transport: r.transport,
        integration_id: r.integrationId,
        provider_message_id: r.providerMessageId,
      },
    });
  } catch {
    /* logging must never block the tool result */
  }
}
