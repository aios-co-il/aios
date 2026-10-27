// Carmen's campaign-pulse rules (AIO-237): one versioned block that
// run-ai-agent appends after the V1/V2 prompt and every skin's text, outside
// the identity, so it reaches V1 with an empty or a custom
// ai_agents.system_prompt and V2 alike, and a tenant pulse skin cannot
// override it. Bump CARMEN_PULSE_RULES_VERSION whenever the rules change.
import { pulseSurfacePrefersWhatsAppDigest } from "../../_shared/campaign-pulse.ts";
import { PULSE_REFRESH_MIN_INTERVAL_SECONDS } from "./snapshot.ts";

export const CARMEN_PULSE_RULES_VERSION = "2026-10-26.2";

/**
 * Appends the pulse block to a finished Carmen prompt. Non-Carmen agents,
 * isolated pin_skills_only sessions (they have no tools) and a prompt that
 * already carries the block come back unchanged.
 */
export function appendCarmenPulseRules(
  systemPrompt: string | null | undefined,
  {
    isCarmen,
    surface,
    pinSkillsOnly = false,
  }: {
    isCarmen?: boolean;
    surface?: string | null;
    pinSkillsOnly?: boolean;
  } = {},
): string {
  const base = systemPrompt ?? "";
  if (!isCarmen || pinSkillsOnly || base.includes(BLOCK_MARKER)) {
    return base;
  }
  return `${base}\n\n${buildCarmenPulseRulesBlock({ surface })}`;
}

/** The pulse rules every Carmen prompt ends with. */
export function buildCarmenPulseRulesBlock({
  surface,
}: { surface?: string | null } = {}): string {
  const minutes = PULSE_REFRESH_MIN_INTERVAL_SECONDS / 60;
  const lines = [
    `${BLOCK_MARKER} (גרסה ${CARMEN_PULSE_RULES_VERSION}) — גוברים על כל כלל דופק קודם בפרומפט, בסקין או בזיכרון ===`,
    '• "דופק", "בדיקת דופק" או "מצב קמפיינים" בלי בקשה לרענן — get_latest_campaign_pulse: הבדיקה האחרונה שנשמרה. זו הדרך המהירה, ולא מרעננים בלי סיבה.',
    `• "רענני דופק", "דופק עדכני", "בדיקת דופק מלאה ועדכנית" או בקשה מפורשת לדופק מעודכן — refresh_campaign_pulse (עם client_id או client_name כשמדובר בלקוח אחד). הכלי מחשב את הדופק מחדש מהנתונים שכבר סונכרנו, לא שולח הודעה לאף אחד, ומרענן לכל היותר פעם ב-${minutes} דקות לארגון. אם הוא החזיר את הבדיקה הקיימת — אמרי מתי היא חושבה.`,
    '• "בדיקת תקינות" (מערכות, חיבורים, חשבונות מודעות) היא health probe — לא דופק. אל תערבבי ביניהן.',
    "• כשמבקשים ממך לנהל, לבדוק או לעקוב אחרי קמפיינים — מותר לך להתחיל בעצמך בסקירת דופק: get_latest_campaign_pulse, ו-refresh_campaign_pulse אם הבדיקה השמורה חושבה לפני יותר מ-12 שעות. משם אפשר להמשיך לניתוח של לקוח שהדופק מסמן (analyze_campaign_performance עם client_id).",
    '• כל שינוי בקמפיין — תקציב, כיבוי או הדלקה, יצירה, שכפול, החלפת טופס, תזמון — רק אחרי אישור מפורש של המשתמש על הסיכום (pending_approval ואז "כן"). סקירה לא מחליפה אישור.',
    "• כל מספר מגיע מפלט הכלי. אסור להשלים נתונים מהזיכרון, ואסור להריץ analyze_campaign_performance במקום הדופק.",
    "• אם אין בדיקת דופק שמורה — אמרי זאת והציעי לרענן.",
  ];
  if (pulseSurfacePrefersWhatsAppDigest(surface)) {
    lines.push(
      '• בוואטסאפ ובמשימות מתוזמנות: אחרי הכלי החזירי את whatsapp_digest כלשונו, כולל בלוק "🔴 דורש טיפול" כשיש ושורת הקישור לדשבורד. אחרי refresh_campaign_pulse פתחי בשורת refresh_note מהכלי. בלי הקדמה, בלי סיכום נוסף, בלי טבלת Markdown, בלי פירוט לקוח-לקוח ובלי שורות שלא הופיעו בפלט.',
    );
  }
  return lines.join("\n");
}

const BLOCK_MARKER = "=== כללי דופק קמפיינים";
