import { normalizeNotifyPhone } from "../../../../supabase/functions/_shared/carmen-notify-target.ts";
import { normalizePhone } from "../../../../supabase/functions/_shared/telephony/phone.ts";

/**
 * The E.164 form stored in carmen_report_recipients.phone, or null when the
 * input cannot be one. normalizePhone first reads a 9-digit Israeli mobile
 * typed without its 0 as local, like phone_match_key does. The table's CHECK
 * constraint has the final say.
 */
export function toReportPhoneE164(raw: string): string | null {
  const digits = normalizeNotifyPhone(normalizePhone(raw));
  return digits && /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}
