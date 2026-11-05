import { toast } from "sonner";
import { REPORT_SENDER_MESSAGES } from "./reportSenderMessages";
import type { ReportWhatsAppResult } from "./sendReportWhatsApp";

/**
 * Confirms a WhatsApp report send. When a group refused the image and only
 * the message and link went out, says so instead of reporting success.
 */
export function toastReportSent(
  result: ReportWhatsAppResult,
  successText: string,
): void {
  if (result.deliveredAs === "text_fallback") {
    toast.warning(REPORT_SENDER_MESSAGES.text_fallback);
    return;
  }
  toast.success(successText);
}
