import type { NamedSenderSource } from "../../../supabase/functions/_shared/report-sender/pick.ts";

/** Hebrew text for every report-sender code and label the UI shows. */
export const REPORT_SENDER_MESSAGES = {
  send_from: "שלח מ",
  sends_from: "יישלח מ:",
  choose_phone: "בחרו טלפון",
  sender_gone: "הטלפון שנבחר כבר לא זמין",
  default_org_lines_only:
    "ברירת המחדל יכולה להיות רק טלפון שפתוח לכל הארגון. טלפון פרטי משמש רק את מי שחיבר אותו.",
  settings_save_failed: "שמירת טלפון ברירת המחדל נכשלה",
  loading: "טוען את טלפוני השליחה, נסו שוב בעוד רגע",
  load_failed: "לא הצלחנו לטעון את טלפוני השליחה",
  no_report_sender:
    "אין טלפון וואטסאפ מחובר לשליחת דוחות. אפשר לחבר טלפון בהגדרות הוואטסאפ.",
  choose_sender: "בחרו מאיזה טלפון לשלוח",
  sender_not_allowed: "הטלפון שנבחר לא זמין לארגון הזה. בחרו טלפון אחר.",
  report_sender_not_allowed: "הטלפון שנבחר לא זמין לארגון הזה. בחרו טלפון אחר.",
  report_settings_forbidden: "רק בעלי הארגון יכולים לשנות את טלפון השליחה",
  stale_default:
    "טלפון ברירת המחדל של הארגון לדוחות כבר לא זמין (נותק, השיתוף שלו בוטל או שהפך לפרטי), ולכן דוחות שיוצאים לפי ברירת המחדל לא נשלחים. בעלי הארגון צריכים לבחור ברירת מחדל חדשה; עד אז בחרו טלפון בשליחה או בתזמון.",
  stale_default_owner:
    "טלפון ברירת המחדל כבר לא זמין (נותק, השיתוף שלו בוטל או שהפך לפרטי), ולכן דוחות שיוצאים לפי ברירת המחדל לא נשלחים. בחרו ברירת מחדל חדשה.",
  not_configured: "הטלפון שנבחר עוד לא מחובר עד הסוף. בדקו אותו בהגדרות.",
  forbidden: "אין לכם הרשאה לשלוח בשם הארגון הזה",
  missing_recipient: "בחרו קבוצה או הזינו מספר טלפון",
  missing_group_chat_id:
    "לקבוצה שנבחרה אין מזהה וואטסאפ. סנכרנו את הקבוצות או שלחו למספר טלפון.",
  invalid_phone: "מספר הטלפון לא תקין",
  blocked_by_staging_safe_mode: "בסביבת הבדיקות אין שליחה לנמען הזה",
  delivery_unknown:
    "לא התקבל אישור שההודעה נשלחה. בדקו בוואטסאפ לפני ששולחים שוב.",
  timeout:
    "השליחה ארכה יותר מדי. בדקו בוואטסאפ אם ההודעה יצאה לפני ששולחים שוב.",
  not_in_group: "הטלפון שנבחר לא חבר בקבוצה הזו",
  text_fallback: "הקבוצה לא קיבלה את התמונה, ולכן נשלחו רק ההודעה והקישור",
  send_failed: "השליחה בוואטסאפ נכשלה",
} as const;

export type ReportSenderMessageKey = keyof typeof REPORT_SENDER_MESSAGES;

/**
 * Error texts the send functions return without a code (older handlers),
 * mapped to the message they mean.
 */
const SERVER_TEXT_CODES = new Map<string, ReportSenderMessageKey>([
  ["Forbidden", "forbidden"],
  ["Internal error", "send_failed"],
  ["Group chat id not found", "missing_group_chat_id"],
  ["Manus WhatsApp not configured", "not_configured"],
  ["Green API not configured", "not_configured"],
  [
    "Green API not configured for your account. Please set up your connection in Settings.",
    "not_configured",
  ],
]);

/** Whether a server or resolver code has a message. */
export function isReportSenderMessageKey(
  code: unknown,
): code is ReportSenderMessageKey {
  return (
    typeof code === "string" &&
    Object.keys(REPORT_SENDER_MESSAGES).includes(code)
  );
}

/**
 * The message for a pick that found no line. A refused organization default
 * gets its own text: only an owner can choose a new one.
 */
export function pickErrorKey<K extends ReportSenderMessageKey>(pick: {
  error: K;
  refused?: NamedSenderSource;
}): K | "stale_default" {
  return pick.refused === "tenant_default" ? "stale_default" : pick.error;
}

/** The Hebrew text for a known code or server text, else null. */
export function reportSenderMessage(code: unknown): string | null {
  if (isReportSenderMessageKey(code)) {
    return REPORT_SENDER_MESSAGES[code];
  }
  const key = typeof code === "string" ? SERVER_TEXT_CODES.get(code) : null;
  return key ? REPORT_SENDER_MESSAGES[key] : null;
}
