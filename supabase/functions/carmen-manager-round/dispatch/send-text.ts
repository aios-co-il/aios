/** One text from Carmen's own line (sendStaffAlert), as an outcome to record. */
import type { StaffAlertResult } from "../../run-ai-agent/staff-alert.ts";
import type { SendOutcome } from "./store.ts";

/**
 * Time a send must have left before it starts: send-manus-wa-message may wait
 * its full 60 s fetch timeout, and a send cut off by the wall clock leaves
 * its rows claimed (delivery_unknown, never retried).
 */
export const SEND_RESERVE_MS = 65_000;

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
