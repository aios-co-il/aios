import { dialablePhone } from "../../../../supabase/functions/_shared/carmen-report-recipients/candidates.ts";
import { normalizePhone } from "../../../../supabase/functions/_shared/telephony/phone.ts";

/**
 * The E.164 form stored in carmen_report_recipients.phone, or null when the
 * input cannot be one. normalizePhone first reads a 9-digit Israeli mobile
 * typed without its 0 as local, like phone_match_key does; dialablePhone is
 * the rule the sends apply, so a saved phone is never shown as invalid. The
 * table's CHECK constraint has the final say.
 */
export function toReportPhoneE164(raw: string): string | null {
  const digits = dialablePhone(normalizePhone(raw));
  return digits ? `+${digits}` : null;
}
