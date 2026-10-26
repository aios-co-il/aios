/**
 * The prompt for the AI step that may still veto a deterministic campaign_exception
 * candidate before it is sent (campaign-pulse-snapshot → deliverInstantPulseAlerts).
 *
 * Three kinds of candidate reach it (AIO-236), and each must be confirmable:
 * - a sustained breach of an approved target;
 * - a sustained breach of Carmen's market target ("יעד שוק (כרמן)",
 *   evidence.target_source = "carmen_market"), which alerts like an approved one;
 * - a campaign with no target whose CPL/CPA rose (or ROAS fell) against its 28-day
 *   baseline past the thresholds named in the reason, on both the 3- and 7-day
 *   windows (target_value null; the reason ends with "אין יעד").
 * Spend with no results also stays confirmable. A prompt that confirms only
 * "approved target" breaches would silently drop the other two kinds.
 */
import type { PulseInstantAlertCandidate } from "./pulse-instant-alerts.ts";

export function buildPulseExceptionConfirmPrompt(
  candidate: Pick<
    PulseInstantAlertCandidate,
    "client_name" | "campaign_key" | "message" | "evidence"
  >,
): string {
  return [
    "את מאמתת מועמד חריגה שכבר סונן דטרמיניסטית. אל תבצעי ניתוח מתקדם ואל תמציאי נתונים.",
    "אשרי רק אם הראיות מראות אחד מאלה:",
    "• חריגה מתמשכת מיעד מאושר (target_source=approved).",
    "• חריגה מתמשכת מיעד שוק (כרמן) (target_source=carmen_market): יעד שכרמן קבעה לפי בנצ׳מרק של הענף בישראל ולפי ההיסטוריה של הלקוח. הוא מתריע כמו יעד מאושר, ואין לדחות אותו רק משום שאדם לא אישר אותו.",
    '• קמפיין בלי יעד (target_value=null, הסיבה מסתיימת ב"אין יעד"): עלייה מתמשכת ב־CPL/CPA או ירידה מתמשכת ב־ROAS מול בסיס 28 הימים שלפני כן, גם ב־3 וגם ב־7 הימים האחרונים, לפחות בסף שמופיע בסיבה (trend_3d_pct, trend_7d_pct). הוצאה בלי תוצאות ב־3 הימים האחרונים (no_results_3d=true) עוברת כל סף. אין לדחות רק משום שאין יעד.',
    "• הוצאה ללא תוצאות.",
    'החזירי JSON בלבד: {"confirmed":boolean,"summary":"משפט קצר","recommended_check":"בדיקה אחת"}.',
    `לקוח: ${candidate.client_name}`,
    `קמפיין: ${candidate.campaign_key || "לא ידוע"}`,
    `סיבה: ${candidate.message}`,
    `ראיות: ${JSON.stringify(candidate.evidence || {})}`,
  ].join("\n");
}
