/** One text from Carmen's own line (sendStaffAlert), as an outcome to record. */
import type { StaffAlertResult } from "../../_shared/staff-notify.ts";
import type { SendOutcome } from "./store.ts";

export type SendStaffMessage = (input: {
  tenantId: string;
  phone: string;
  message: string;
}) => Promise<StaffAlertResult>;

/** Sends `message` and reports what happened; never throws. */
export async function sendText(
  send: SendStaffMessage,
  tenantId: string,
  phone: string | null,
  message: string,
): Promise<SendOutcome> {
  const messageKey = crypto.randomUUID();
  if (!phone) {
    return { status: "no_phone", messageKey };
  }
  try {
    const result = await send({ tenantId, phone, message });
    return {
      status: result.status,
      messageKey,
      providerMessageId: result.providerMessageId,
      error: result.error,
    };
  } catch (error) {
    return {
      status: "failed",
      messageKey,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
