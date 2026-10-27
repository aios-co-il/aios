/**
 * The model prompt for one group window. Speakers appear only as "לקוח" or
 * "צוות", phone numbers in message text are masked, and the prompt is
 * bounded (the newest messages win), so a call stays around 2-3K tokens.
 */
import { APP_TIME_ZONE } from "../../../_shared/calendarTimeZone.ts";
import type { CardEntry } from "./card-entries.ts";
import { clamp, DIGEST_ITEM_TYPES } from "./digest.ts";
import type { GroupWindow, WindowMessage } from "./windows.ts";

const MAX_LINE_CHARS = 280;
const MAX_TRANSCRIPT_CHARS = 6_000;
const MAX_CARD_LINES = 10;
const PHONE = /(?:\+?972[\s-]?|\b0)[2-9](?:[\s-]?\d){7,8}\b/g;

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
    "אל תחזרי על מה שכבר רשום היום בכרטיס, אל תצייני מספרי טלפון",
    'ואל תמציאי פרטים. כתבי "הלקוח" או "הצוות", לא שמות.',
    "",
    "רשום היום בכרטיס:",
    ...(card.length ? card : ["- אין"]),
    "",
    "ההודעות:",
    ...transcript(window.messages),
    "",
    "החזירי JSON בלבד במבנה:",
    `{"material": true/false, "update_text": "שורה אחת בעברית עד 300 תווים", "items": [{"type": "${DIGEST_ITEM_TYPES.join("|")}", "text": "עד 200 תווים"}]}`,
  ].join("\n");
}

/** Phone numbers in free text replaced by a placeholder. */
export function maskPhones(text: string): string {
  return text.replace(PHONE, "[טלפון]");
}

/** One line per message, newest kept when the transcript is too long. */
function transcript(messages: WindowMessage[]): string[] {
  const lines: string[] = [];
  let size = 0;
  for (const message of [...messages].reverse()) {
    const line = `[${when(message.at)}] ${message.speaker === "staff" ? "צוות" : "לקוח"}: ${clamp(maskPhones(message.text), MAX_LINE_CHARS)}`;
    if (size + line.length > MAX_TRANSCRIPT_CHARS) {
      break;
    }
    lines.unshift(line);
    size += line.length;
  }
  return lines;
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
