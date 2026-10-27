/**
 * When a dev task may be approved and sent to a coding agent (Cursor or Claude). Like the
 * workshop budget (workshop/budget.ts), the approval is the user's own message in a later turn
 * than the one that made the task: Carmen offers the task, and only the user's "כן" in the next
 * message approves it. Nothing Carmen read or wrote in the same turn can approve it.
 */
import {
  isExplicitApprovalPhrase,
  isExplicitRejectionPhrase,
  normalizeApprovalText,
} from "./wa-approval-flow.ts";

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
  "yes",
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
  "הפיתוח",
  "לפיתוח",
  "פיתוח",
  "קרסר",
  "לקרסר",
  "קלוד",
  "לקלוד",
  "cursor",
  "claude",
  "ל-cursor",
  "ל-claude",
  "לcursor",
  "לclaude",
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

export interface DevTaskApprovalInput {
  task: { status?: string | null; created_at?: string | null } | null;
  /** The user's own message in this turn. */
  userText?: string | null;
  /** When this turn (the user's message) started; the task must be older. */
  turnStartedAt?: string | Date | null;
  /** David approved this exact call in the approvals queue. */
  outOfBand?: boolean;
}

export type DevTaskApprovalRefusal =
  "not_found" | "not_draft" | "no_turn" | "same_turn" | "not_explicit";

export type DevTaskApprovalDecision =
  { ok: true } | { ok: false; reason: DevTaskApprovalRefusal; message: string };

const REFUSAL_MESSAGES: Record<DevTaskApprovalRefusal, string> = {
  not_found: "משימת הפיתוח לא נמצאה. בדקי את המזהה עם list_dev_tasks.",
  not_draft:
    "המשימה כבר לא מחכה לאישור (היא נשלחה, נסגרה או בוטלה). בדקי את הסטטוס עם list_dev_tasks.",
  no_turn:
    "משימת פיתוח מאשרים רק מתוך שיחה עם המשתמש, אחרי שענה 'כן'. ספרי לו מה המשימה ושאלי אם לשלוח.",
  same_turn:
    "המשימה נפתחה בהודעה הזו. ספרי למשתמש במשפט מה המשימה ולמי היא תישלח (Cursor או Claude) ושאלי אם לשלוח. אשרי רק אחרי שיענה 'כן' בהודעה הבאה.",
  not_explicit:
    "ההודעה של המשתמש היא לא אישור מפורש לשליחת המשימה. שאלי אם לשלוח אותה, ואשרי רק אחרי 'כן' ברור בהודעה נפרדת.",
};

const time = (value: string | Date | null | undefined) =>
  value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""));

/** Whether approve_dev_task may approve this task now. */
export function devTaskApprovalDecision(
  input: DevTaskApprovalInput,
): DevTaskApprovalDecision {
  const refuse = (reason: DevTaskApprovalRefusal): DevTaskApprovalDecision => ({
    ok: false,
    reason,
    message: REFUSAL_MESSAGES[reason],
  });
  const task = input.task;
  if (!task) return refuse("not_found");
  if (task.status !== "draft" && task.status !== "approved")
    return refuse("not_draft");
  if (input.outOfBand) return { ok: true };
  const started = time(input.turnStartedAt);
  if (!Number.isFinite(started) || !String(input.userText ?? "").trim())
    return refuse("no_turn");
  const created = time(task.created_at);
  if (!Number.isFinite(created) || created >= started)
    return refuse("same_turn");
  if (!isExplicitDevTaskApproval(input.userText)) return refuse("not_explicit");
  return { ok: true };
}

export const DEV_TASK_NOT_APPROVED_HE =
  "אפשר לשלוח משימת פיתוח רק אחרי שאושרה. קודם approve_dev_task, אחרי שהמשתמש ענה 'כן' בהודעה נפרדת, ורק אז שליחה.";

/** Why a task may not be sent to a coding agent yet; null when it is approved. */
export function dispatchRefusal(
  task: { status?: string | null; approved_by?: string | null } | null,
): { error: "dev_task_not_approved"; message: string } | null {
  if (task && task.status === "approved" && task.approved_by) return null;
  return { error: "dev_task_not_approved", message: DEV_TASK_NOT_APPROVED_HE };
}

/** Thrown by dispatchDevTask for a task that was not approved. */
export class DevTaskNotApprovedError extends Error {
  readonly code = "dev_task_not_approved";
  constructor(message = DEV_TASK_NOT_APPROVED_HE) {
    super(message);
    this.name = "DevTaskNotApprovedError";
  }
}
