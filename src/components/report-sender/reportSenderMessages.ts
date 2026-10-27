/** Hebrew text for every report-sender code the UI can meet. */
export const REPORT_SENDER_MESSAGES = {
  loading: "טוען את טלפוני השליחה, נסו שוב בעוד רגע",
  load_failed: "לא הצלחנו לטעון את טלפוני השליחה",
  no_report_sender:
    "אין טלפון וואטסאפ מחובר לשליחת דוחות. אפשר לחבר טלפון בהגדרות הוואטסאפ.",
  choose_sender: "בחרו מאיזה טלפון לשלוח",
  sender_not_allowed: "הטלפון שנבחר לא זמין לארגון הזה. בחרו טלפון אחר.",
  report_sender_not_allowed: "הטלפון שנבחר לא זמין לארגון הזה. בחרו טלפון אחר.",
  report_settings_forbidden: "רק בעלי הארגון יכולים לשנות את טלפון השליחה",
  not_configured: "הטלפון שנבחר עוד לא מחובר עד הסוף. בדקו אותו בהגדרות.",
  blocked_by_staging_safe_mode: "בסביבת הבדיקות אין שליחה לנמען הזה",
  delivery_unknown:
    "לא התקבל אישור שההודעה נשלחה. בדקו בוואטסאפ לפני ששולחים שוב.",
  timeout:
    "השליחה ארכה יותר מדי. בדקו בוואטסאפ אם ההודעה יצאה לפני ששולחים שוב.",
  not_in_group: "הטלפון שנבחר לא חבר בקבוצה הזו",
  send_failed: "השליחה בוואטסאפ נכשלה",
} as const;

export type ReportSenderMessageKey = keyof typeof REPORT_SENDER_MESSAGES;

/** Whether a server or resolver code has a message. */
export function isReportSenderMessageKey(
  code: unknown,
): code is ReportSenderMessageKey {
  return (
    typeof code === "string" &&
    Object.keys(REPORT_SENDER_MESSAGES).includes(code)
  );
}

/** The Hebrew text for a known code, else null. */
export function reportSenderMessage(code: unknown): string | null {
  return isReportSenderMessageKey(code) ? REPORT_SENDER_MESSAGES[code] : null;
}
