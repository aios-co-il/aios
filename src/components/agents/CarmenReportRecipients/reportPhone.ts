import { normalizeNotifyPhone } from "../../../../supabase/functions/_shared/carmen-notify-target.ts";

/**
 * The E.164 form stored in carmen_report_recipients.phone, or null when the
 * input cannot be one. The table's CHECK constraint has the final say.
 */
export function toReportPhoneE164(raw: string): string | null {
  const digits = normalizeNotifyPhone(raw);
  return digits && /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}
