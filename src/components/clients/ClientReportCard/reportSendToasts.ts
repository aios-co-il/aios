import { toast } from "sonner";
import { toastReportSent } from "@/components/report-sender/toastReportSent";
import type { ChannelResult } from "./deliverReport";
import type { ReportSendCopy } from "./reportSendKinds";

/** Tells one channel's outcome, with a reconnect action when Gmail's grant expired. */
export function toastChannelResult(
  result: ChannelResult,
  copy: ReportSendCopy,
  reconnectGmail: () => void,
) {
  if (result.ok && result.whatsApp) {
    toastReportSent(result.whatsApp, copy.whatsAppSentToast);
    return;
  }
  if (result.ok) {
    toast.success(copy.emailSentToast);
    return;
  }
  const message = errorMessage(result.error);
  if (result.channel === "email" && isGmailExpired(message)) {
    toast.error("חיבור ה-Gmail פג. יש להתחבר מחדש.", {
      action: { label: "התחבר מחדש", onClick: reconnectGmail },
      duration: 8000,
    });
    return;
  }
  const channelName = result.channel === "whatsapp" ? "בוואטסאפ" : "באימייל";
  toast.error(`שגיאה בשליחה ${channelName}: ${message}`);
}

/** Gmail answered that its grant expired or was never connected. */
function isGmailExpired(message: string): boolean {
  return (
    message.includes("Token refresh failed") ||
    message.includes("Gmail not connected") ||
    message.includes("invalid_grant")
  );
}

/** An error's message, or a generic word when it has none. */
export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "לא ידוע";
}
