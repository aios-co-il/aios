import { Constants, type Enums } from "@/integrations/supabase/types";
import {
  CLIENT_SEND_REFUSALS,
  type ClientSendRefusal,
} from "../../../../supabase/functions/_shared/client-send/types.ts";

export type ClientAutoSendKind = Enums<"client_auto_send_kind">;

export type ClientAutoSendTarget = Enums<"client_auto_send_target">;

/** The switch rows, in the database enum's order. */
export const CLIENT_AUTO_SEND_KINDS =
  Constants.public.Enums.client_auto_send_kind;

/** The switch columns, in the database enum's order. */
export const CLIENT_AUTO_SEND_TARGETS =
  Constants.public.Enums.client_auto_send_target;

export const AUTO_SEND_KIND_LABELS: Record<ClientAutoSendKind, string> = {
  lead_alert: "התראות על לידים חדשים",
  campaign_alert: "התראות קמפיין (קמפיין נעצר, מודעה נדחתה, חשבון מושבת)",
  automation: "אוטומציות אחרות של הארגון",
};

export const AUTO_SEND_TARGET_LABELS: Record<ClientAutoSendTarget, string> = {
  whatsapp_group: "קבוצת הוואטסאפ של הלקוח",
  whatsapp_direct: "וואטסאפ אישי (הטלפון בכרטיס ואנשי הקשר)",
  email: "אימייל",
};

/** Why a column's switches are off limits: the card has no such address. */
export const MISSING_TARGET_HINTS: Record<ClientAutoSendTarget, string> = {
  whatsapp_group: "אין קבוצה מקושרת בכרטיס",
  whatsapp_direct: "אין טלפון בכרטיס",
  email: "אין אימייל בכרטיס",
};

export const REFUSAL_LABELS: Record<ClientSendRefusal, string> = {
  unclassified_service_send: "שליחה אוטומטית לא מסווגת",
  person_only_kind: "הודעה שנשלחת רק ידנית",
  staff_only: "הודעה פנימית לצוות",
  proof_missing: "לא צוין איזה דוח או דיוור נשלח",
  proof_invalid: "הדוח, הדיוור או האוטומציה לא פעילים",
  automation_without_ref: "לא צוין איזו אוטומציה שלחה",
  not_opted_in: "לא אושר בכרטיס",
  no_subject: "לא צוין על איזה לקוח התוכן",
  subject_mismatch: "התוכן על לקוח אחר",
  ambiguous_group: "הקבוצה מקושרת לכמה לקוחות",
  automation_broadcast_unverified: "תבנית מאוטומציה שלא אושרה בכרטיס",
  carmen_unverified: "הודעה של כרמן שלא אומתה",
  unresolvable_address: "כתובת שלא ניתן לזהות",
  guard_error: "בדיקת הנמען נכשלה",
};

/**
 * The Hebrew reason of a logged refusal. The column is plain text, so a
 * reason newer than this build shows as stored.
 */
export function refusalLabel(reason: string): string {
  return isClientSendRefusal(reason) ? REFUSAL_LABELS[reason] : reason;
}

/** Enforced refusals blocked the send; observed ones only logged it. */
export function refusalStatusLabel(enforced: boolean): string {
  return enforced ? "נחסם" : "ייחסם כשההגנה תופעל";
}

/** Whether a stored reason is one of CLIENT_SEND_REFUSALS. */
function isClientSendRefusal(value: string): value is ClientSendRefusal {
  return CLIENT_SEND_REFUSALS.some((reason) => reason === value);
}
