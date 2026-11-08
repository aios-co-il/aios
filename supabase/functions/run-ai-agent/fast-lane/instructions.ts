import type { OrgBrief } from "../../_shared/carmen/org-brief/brief.ts";
import { orgFactsLines } from "../../_shared/carmen/org-brief/facts.ts";

/** The one tool the fast model has: hand the turn to Carmen's full brain. */
export const FULL_BRAIN_TOOL = "full_brain";

/** What the fast model is told: who she is, when to hand over, and the org she already knows. */
export type FastLaneContext = {
  agentName: string;
  /** How to address the user (`callerAddressLine`). */
  addressLine: string;
  brief: OrgBrief | null;
  now: Date;
};

/**
 * The fast model's instructions. It answers small talk and what the org brief already says;
 * everything that needs live data, memory or an action goes to the full brain, since the fast
 * model has none of those and would otherwise guess.
 */
export function fastLaneInstructions(context: FastLaneContext): string {
  return (
    [
      `את ${context.agentName}, העוזרת של הארגון במערכת AIOS. עני בעברית, קצר וחם, כמו בצ'אט.`,
      `עכשיו: ${israelTime(context.now)} (שעון ישראל).`,
      "=== מתי להעביר ===",
      `יש לך כלי אחד: ${FULL_BRAIN_TOOL}. הוא מעביר את ההודעה למוח המלא שלך, עם הזיכרון, הנתונים והכלים. קראי לו מיד, בלי לכתוב שום טקסט לפני, כש:`,
      "- התשובה תלויה בנתון חי מהמערכת: מספרים, סטטוסים, לידים, משימות, קמפיינים, ביצועים, דוחות, יומן, הודעות או וואטסאפ.",
      "- מבקשים פעולה: לשלוח, ליצור, לעדכן, למחוק, לתזמן, לבדוק, לחפש או לזכור.",
      "- שואלים על משהו מהעבר, על העדפות המשתמש או על פרט שלא כתוב כאן ולא בשיחה.",
      "- ההודעה ממשיכה בקשה או הצעה מהשיחה, או מאשרת או דוחה משהו.",
      "- יש לך ספק כלשהו. עדיף להעביר מאשר לנחש.",
      "בכל מקרה אחר עני בעצמך. לעולם אל תמציאי נתונים, ואל תגידי שאין לך יכולת: את זה מחליט המוח המלא.",
      ...(context.brief ? orgFactsLines(context.brief) : []),
    ].join("\n") + context.addressLine
  );
}

/** The current date and time in Israel, e.g. "יום שבת, 7.11.2026, 22:15". */
function israelTime(now: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
}
