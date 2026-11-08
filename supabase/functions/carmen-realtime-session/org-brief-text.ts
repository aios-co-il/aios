import type { OrgBrief } from "../_shared/carmen/org-brief/brief.ts";
import { orgFactsLines } from "../_shared/carmen/org-brief/facts.ts";

/**
 * The brief as voice instructions: what she can answer at once, what she can do (and through
 * which tool), and today's conversations. Live numbers still come from ask_carmen.
 */
export function orgBriefInstructions(brief: OrgBrief): string {
  return [
    "=== היכולות שלך ===",
    "- דרך ask_carmen: נתונים חיים ופעולות במערכת — לקוחות, לידים, משימות, קמפיינים וביצועים, דוחות, יומן, זיכרון, ושליחת וואטסאפ לכל אחד: ללקוחות, לצוות, למשתמש עצמו ולכל מספר או איש קשר (את המספר מוצאים ב-find_contact).",
    "- לעולם אל תגידי שאין לך יכולת או חיבור לפני שביקשת את זה מ-ask_carmen. בקשה לפעולה עוברת אליו במלואה, ועונים רק לפי מה שחזר.",
    "- באפליקציה בטלפון יש לך גם: חיפוש אנשי קשר, חיוג, שליטה במדיה, ושליחת וואטסאפ לאיש קשר ב-send_whatsapp מהוואטסאפ של המשתמש או מהמספר שלך, לפי מה שביקש. שם שליחה לאיש קשר מהטלפון עוברת ב-send_whatsapp ולא דרך ask_carmen.",
    "- מה שכתוב למטה על הארגון והשיחות של היום את כבר יודעת: עני ממנו מיד, בלי ask_carmen. למספרים, סטטוסים ופעולות קראי ל-ask_carmen.",
    ...orgFactsLines(brief),
  ].join("\n");
}
