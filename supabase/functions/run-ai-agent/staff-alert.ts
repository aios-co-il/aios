/**
 * Staff alerts leave only from Carmen's own Manus line.
 *
 * sendStaffAlert sends a 1:1 WhatsApp to a staff member through the tenant's
 * active manus_wa integration, via send-manus-wa-message. That sender applies
 * the Staging outbound guard (checkWhatsAppSend) and writes the chat_messages
 * row, so every staff alert is guarded and recorded.
 *
 * Only PRIMARY Carmen lines are used (resolveCarmenConnectionRole, the rule
 * trigger-automation's isPrimaryCarmenIntegration enforces): a Manus line
 * marked secondary or none, such as the owner's personal phone, never sends
 * staff alerts. With no primary Manus line the result is no_line.
 *
 * It never selects a Green API integration (David's operator phone) and never
 * passes clientId or groupId, so an alert cannot land in a client thread.
 * It returns the real delivery outcome; a 202 "delivery unknown" from Manus is
 * reported as such and never retried on another line.
 */

import { normalizeStaffPhone } from "../_shared/staff-whatsapp.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import {
  postWaSend,
  SEND_MANUS_FN,
  type WaSendStatus,
} from "../_shared/whatsapp/send-result.ts";
import { loadManusLines, type ManusLine } from "./staff-alert-lines.ts";
import { staffAlertSender } from "./staff-alert-sender.ts";

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

export const STAFF_ALERT_NO_PRIMARY_LINE_HE =
  "אף חיבור WhatsApp של Manus בטננט לא מסומן כראשי, והתראות לצוות יוצאות רק מהחיבור הראשי של כרמן. אפשר לסמן את הטלפון של כרמן כראשי בכרמן ← חיבורי ווטסאפ.";

export type StaffAlertInput = {
  supabase: Pick<DbClient, "auth" | "from" | "rpc">;
  supabaseUrl: string;
  serviceRoleKey: string;
  tenantId: string;
  phone: string;
  message: string;
  /** The person Carmen acts for; who actually sends: staff-alert-sender.ts. */
  requesterUserId?: string | null;
  fetchImpl?: typeof fetch;
};

/** Sends a 1:1 staff WhatsApp from the tenant's primary Manus line and returns the real delivery outcome. */
export async function sendStaffAlert(
  input: StaffAlertInput,
): Promise<StaffAlertResult> {
  const phone = normalizeStaffPhone(input.phone);
  if (!phone) {
    return staffAlertResult("no_phone", { error: "מספר טלפון לא תקין" });
  }
  try {
    const lines = await loadManusLines(input.supabase, input.tenantId);
    if (!lines.primary.length) {
      return staffAlertResult("no_line", {
        phone,
        error: lines.manus.length
          ? STAFF_ALERT_NO_PRIMARY_LINE_HE
          : STAFF_ALERT_NO_LINE_HE,
      });
    }
    return await sendFromLines(input, phone, lines.primary);
  } catch (e) {
    // The DB text stays in the log; Carmen's tool result gets a generic error.
    console.error(
      "[staff-alert] line or sender lookup failed",
      input.tenantId,
      e instanceof Error ? e.message : String(e),
    );
    return staffAlertResult("failed", { phone, error: "שליחה נכשלה" });
  }
}

/** Tries each primary line in turn; only a definite failure moves on to the next. */
async function sendFromLines(
  input: StaffAlertInput,
  phone: string,
  lines: ManusLine[],
): Promise<StaffAlertResult> {
  const senderFor = await staffAlertSender(input);
  let last: StaffAlertResult | null = null;
  for (const line of lines) {
    const senderUserId = await senderFor(line);
    if (!senderUserId) {
      last = staffAlertResult("no_sender", {
        phone,
        integrationId: line.id,
        error: "לא נמצא משתמש שולח בטננט עבור קו כרמן",
      });
      continue;
    }
    const outcome = await postWaSend({
      fetchImpl: input.fetchImpl ?? fetch,
      supabaseUrl: input.supabaseUrl,
      serviceRoleKey: input.serviceRoleKey,
      functionName: SEND_MANUS_FN,
      body: {
        tenantId: input.tenantId,
        integrationId: line.id,
        senderUserId,
        phoneNumber: phone,
        message: input.message,
      },
    });
    last = staffAlertResult(outcome.status, {
      transport: "manus_wa",
      integrationId: line.id,
      providerMessageId: outcome.providerMessageId,
      error: outcome.error,
      phone,
    });
    // A send that may have left (delivery_unknown: a 202, a network error or
    // an edge timeout), a Staging block or a duplicate skip must not be
    // repeated on another line.
    if (outcome.status !== "failed") {
      return last;
    }
  }
  return (
    last ??
    staffAlertResult("no_line", { phone, error: STAFF_ALERT_NO_LINE_HE })
  );
}

/** A result with every field not given set to null. */
function staffAlertResult(
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
