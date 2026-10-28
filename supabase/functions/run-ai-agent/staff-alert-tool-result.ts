import type {
  StaffAlertResult,
  StaffAlertStatus,
} from "../_shared/staff-alert/send.ts";

export type StaffAlertToolResult = {
  status: StaffAlertStatus;
  provider: StaffAlertResult["transport"];
  integration_id: string | null;
  success?: true;
  message_id?: string | null;
  warning?: string;
  error?: string;
};

/** Tool-facing shape for send_whatsapp_to_staff / send_message_to_campaigner. */
export function staffAlertToolResult(
  r: StaffAlertResult,
): StaffAlertToolResult {
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
