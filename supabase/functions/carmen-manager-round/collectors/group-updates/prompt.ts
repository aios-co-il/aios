/**
 * The model prompt for one group window. Speakers appear only as "לקוח",
 * "צוות" or "לא מזוהה", phone numbers in message text are masked, and the
 * prompt is bounded (the newest messages win), so a call stays around 2-3K
 * tokens. Each line carries its message's place in the window (#n), which
 * the model's contact claim names (contact.ts).
 */
import { APP_TIME_ZONE } from "../../../_shared/calendarTimeZone.ts";
import { CONTACT_UPDATE_TYPES } from "../../../_shared/client-card/sources.ts";
import type { CardEntry } from "./card-entries.ts";
import { clamp } from "./clamp.ts";
import { CONTACT_TENSES, DIGEST_ITEM_TYPES } from "./digest.ts";
import type { GroupWindow, Speaker, WindowMessage } from "./windows.ts";

const MAX_LINE_CHARS = 280;
const MAX_TRANSCRIPT_CHARS = 6_000;
const MAX_CARD_LINES = 10;
const PHONE = /(?:\+?972[\s-]?|\b0)[2-9](?:[\s-]?\d){7,8}\b/g;
const SPEAKER_LABEL_HE: Record<Speaker, string> = {
  client: "לקוח",
  staff: "צוות",
  unknown: "לא מזוהה",
};

/** The prompt asking for {material, update_text, items[]}. */
export function digestPrompt(window: GroupWindow, today: CardEntry[]): string {
  const card = today
    .slice(-MAX_CARD_LINES)
    .map((entry) => `- ${clamp(maskPhones(entry.content), 200)}`);
  return [
    "את מנהלת השיווק כרמן. לפנייך הודעות מקבוצת הוואטסאפ של הלקוח",
    `"${window.clientName}" מאז העדכון האחרון בכרטיס הלקוח.`,
    "החליטי אם יש בהן מידע מהותי שמנהל הלקוח צריך לרשום בכרטיס:",
    "החלטות, אישורים, בקשות, שינויי תקציב, שינויים בקריאייטיב או תלונות.",
    "שיחת חולין, תודות ותיאום שעות אינם מהותיים.",
    "שיחת טלפון או פגישה עם הלקוח שכבר התקיימה היא מידע מהותי.",
    "אל תחזרי על מה שכבר רשום היום בכרטיס, אל תצייני מספרי טלפון",
    'ואל תמציאי פרטים. כתבי "הלקוח" או "הצוות", לא שמות.',
    'הודעות של שולח "לא מזוהה" אל תייחסי ללקוח ולא לצוות.',
    "",
    "רשום היום בכרטיס:",
    ...(card.length ? card : ["- אין"]),
    "",
    "ההודעות:",
    ...transcriptLines(window.messages).lines,
    "",
    'אם הודעה מדווחת על שיחת טלפון או פגישה עם הלקוח (למשל "בהמשך לפגישתנו", "דיברנו בטלפון"),',
    "החזירי ב-contact את מספר השורה שלה (#), את הסוג (call לשיחה, meeting לפגישה) ואת הזמן:",
    'past אם כבר התקיימה, planned אם היא מתוכננת או מוצעת ("נדבר מחר", "נקבע פגישה"), question אם שואלים עליה.',
    "אחרת contact הוא null.",
    "",
    "החזירי JSON בלבד במבנה:",
    `{"material": true/false, "update_text": "שורה אחת בעברית עד 300 תווים", "items": [{"type": "${DIGEST_ITEM_TYPES.join("|")}", "text": "עד 200 תווים"}], "contact": null או {"line": מספר, "kind": "${CONTACT_UPDATE_TYPES.join("|")}", "tense": "${CONTACT_TENSES.join("|")}", "text": "תיאור קצר של השיחה או הפגישה, עד 200 תווים"}}`,
  ].join("\n");
}

/** Phone numbers in free text replaced by a placeholder. */
export function maskPhones(text: string): string {
  return text.replace(PHONE, "[טלפון]");
}

/**
 * One line per message (#n is its place in the window), newest kept when the
 * transcript is too long; `from` is the index of the oldest message shown,
 * so a model claim can only name a line the prompt showed (contact.ts).
 */
export function transcriptLines(messages: WindowMessage[]): {
  lines: string[];
  from: number;
} {
  const lines: string[] = [];
  let size = 0;
  let from = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const line = `#${i + 1} [${when(message.at)}] ${SPEAKER_LABEL_HE[message.speaker]}: ${clamp(maskPhones(message.text), MAX_LINE_CHARS)}`;
    if (size + line.length > MAX_TRANSCRIPT_CHARS) {
      break;
    }
    lines.unshift(line);
    size += line.length;
    from = i;
  }
  return { lines, from };
}

/** Day.month hour:minute in Israel time. */
function when(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}
