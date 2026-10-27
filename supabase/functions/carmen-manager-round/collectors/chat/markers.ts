/**
 * Deterministic markers of what a client wrote: a request (a question or a
 * request verb) and a complaint (the shared complaint words). They decide
 * alone for direct chats and whenever the LLM is unavailable, and an LLM
 * verdict can only add to them, never clear them.
 */
import { hasComplaintWords } from "../../../_shared/client-signals/complaint-words.ts";

export type Markers = { request: boolean; complaint: boolean };

const QUESTION = /[?؟？]/;

const REQUEST_WORDS =
  /אפשר|תוכל|צריך|צריכ|בבקשה|נא ל|תשלח|שלחו|לשלוח|תעלה|תעלו|להעלות|תעדכנ|לעדכן|מתי|תחזור|תחזרי|תחזרו|לחזור אלי|תבדק|תבדוק|לבדוק|תוסיפ|להוסיף|לשנות|תשנה|תשנו|להוריד|תוריד|לעצור|תעצור|מחכה|מחכים|דחוף/;

/** Thanks, acknowledgements and emoji: no answer is owed. */
const ACK_WORDS = new Set([
  "תודה",
  "רבה",
  "תנקס",
  "סבבה",
  "אוקי",
  "אוקיי",
  "ok",
  "okay",
  "מעולה",
  "מצוין",
  "מצויין",
  "יופי",
  "אחלה",
  "קיבלתי",
  "בסדר",
  "נהדר",
  "מושלם",
  "thanks",
]);

/**
 * Acknowledgements that report the client got something: after a request
 * they may mean it was met outside the thread (e.g. a scheduled report).
 */
const RECEIPT_WORDS: ReadonlySet<string> = new Set(["קיבלתי"]);

/** The markers over the client's waiting messages. */
export function readMarkers(texts: string[]): Markers {
  return {
    request: texts.some(isRequest),
    complaint: texts.some(hasComplaintWords),
  };
}

/** True when every message is only thanks, acknowledgements or emoji. */
export function onlyAcknowledgements(texts: string[]): boolean {
  return texts.every(isAcknowledgement);
}

/** True when every message is only thanks or emoji: acknowledgements without a receipt word. */
export function onlyThanks(texts: string[]): boolean {
  return texts.every(
    (text) =>
      isAcknowledgement(text) &&
      !wordsOf(text).some((word) => RECEIPT_WORDS.has(word)),
  );
}

/** A question, or a request verb in a message that is not just thanks. */
function isRequest(text: string): boolean {
  if (QUESTION.test(text)) {
    return true;
  }
  return !isAcknowledgement(text) && REQUEST_WORDS.test(text);
}

/** Only thanks, acknowledgements, punctuation or emoji. */
function isAcknowledgement(text: string): boolean {
  return wordsOf(text).every((word) => ACK_WORDS.has(word));
}

/** The lower-cased words of a message, without punctuation or emoji. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}
