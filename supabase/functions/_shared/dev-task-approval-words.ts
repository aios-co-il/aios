/** Whether the user's message is a plain yes or a plain no to the dev task Carmen offered. */
import {
  isExplicitApprovalPhrase,
  isExplicitRejectionPhrase,
  normalizeApprovalText,
} from "./wa-approval-flow.ts";
import { AGENT_WORDS, asWord } from "./dev-task-agents.ts";
import { askedChoices } from "./workshop/tapped-answers.ts";

/**
 * The user's message is a plain yes to the offered dev task: a confirm word with only small
 * words around it ("כן", "מאשר", "כן תשלחי לקרסר", "yes, send it"), and no holding back.
 * A longer message with a new request is not an approval; Carmen asks again.
 */
export function isExplicitDevTaskApproval(text: unknown): boolean {
  const t = normalizeApprovalText(text);
  if (!t || t.length > 80) return false;
  if (isExplicitRejectionPhrase(t) || HOLD.test(t)) return false;
  if (isExplicitApprovalPhrase(t)) return true;
  const list = words(t);
  if (!list.some((word) => ANCHORS.has(word))) return false;
  return list.every((word) => ANCHORS.has(word) || FILLERS.has(word));
}

/** Words that carry the yes: a confirm or an order to send or open the task. */
const ANCHORS = new Set([
  "כן",
  "מאשר",
  "מאשרת",
  "אשרי",
  "אשר",
  "שלחי",
  "תשלחי",
  "שלח",
  "תשלח",
  "תעבירי",
  "העבירי",
  "תעביר",
  "פתחי",
  "תפתחי",
  "תפתח",
  "יאללה",
  "קדימה",
  "סגור",
  "בטח",
  "אוקיי",
  "אוקי",
  "סבבה",
  "מעולה",
  // Button labels are often infinitives or nouns: "כן, לשלוח", "מאשר שליחה".
  "לשלוח",
  "שליחה",
  "לפתוח",
  "yes",
  "ok",
  "okay",
  "sure",
  "approve",
  "approved",
  "send",
  "go",
]);

/** Words that may stand around the yes ("כן, תשלחי את זה לקרסר"). */
const FILLERS = new Set([
  "את",
  "זה",
  "זאת",
  "אותה",
  "אותו",
  "המשימה",
  "משימה",
  "משימת",
  "הפיתוח",
  "לפיתוח",
  "פיתוח",
  // An agent's name, bare or after "to": "קרסר", "לקרסר", "ל-Claude".
  ...AGENT_WORDS.flatMap((name) => [name, `ל${name}`, `ל-${name}`]),
  "code",
  "קוד",
  "עכשיו",
  "מיד",
  "בבקשה",
  "תודה",
  "please",
  "it",
  "ahead",
  "now",
  "to",
]);

/** A word that holds the approval back ("לא", "עוד לא", "רגע", "חכי"). */
const HOLD =
  /(?<![א-ת])(לא|אל|עוד|עדיין|רגע|חכי|תחכי|בלי)(?![א-ת])|\b(no|not|don'?t|wait|stop)\b/iu;

const words = (text: string) =>
  text
    .toLowerCase()
    // A Hebrew maqaf ("ל־Cursor") reads as a hyphen.
    .replace(/־/g, "-")
    .replace(/[.,!?;:"'״׳()[\]]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    // "ותשלחי" is "and send": a leading ו before a known word is the conjunction.
    .map((word) =>
      word.startsWith("ו") &&
      (ANCHORS.has(word.slice(1)) || FILLERS.has(word.slice(1)))
        ? word.slice(1)
        : word,
    );

/** A choice that asks whether to send a dev task ("לשלוח את משימת הפיתוח?", "לשלוח לקרסר?"). */
const OFFER_LABEL = new RegExp(
  `משימ(?:ת|ה|ות)\\s+(?:ה)?פיתוח|לפיתוח|${asWord(AGENT_WORDS)}`,
  "iu",
);

/**
 * Carmen's message asks the user whether to send a dev task: a tap-to-answer choice about the
 * task with a yes option. The user's yes answers only this question, never another one (a
 * designer's "[[בחירה: להמשיך? | כן | לא]]").
 */
export function offersDevTask(lastAssistant: unknown): boolean {
  return askedChoices(String(lastAssistant ?? "")).some(
    (choice) =>
      OFFER_LABEL.test(choice.label) &&
      choice.options.some((option) => isExplicitDevTaskApproval(option)),
  );
}

const FIRST_NO = new Set(["לא", "אל", "בטלי", "תבטלי", "ביטול", "no", "nope"]);

/**
 * The user's message is a plain no to the offered dev task ("לא", "לא, עוד לא", "אל תשלחי"):
 * it starts with a no and stays short. "לא יודעת, מה את ממליצה?" is a question, not a no.
 */
export function isExplicitDevTaskDecline(text: unknown): boolean {
  const t = normalizeApprovalText(text);
  if (!t || t.length > 80) return false;
  if (isExplicitRejectionPhrase(t)) return true;
  const list = words(t);
  return list.length <= 4 && FIRST_NO.has(list[0]);
}
