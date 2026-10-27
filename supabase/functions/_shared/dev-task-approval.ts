/**
 * In the workshop, when a dev task may be approved and sent to a coding agent (Cursor or Claude).
 * Like the workshop budget (workshop/budget.ts), the approval is the user's own message in the
 * app chat, in a later turn than the one that offered the task: Carmen offers the task, and only
 * the user's "כן" in the next message approves and sends it. Nothing Carmen read or wrote in the
 * same turn can. Outside the workshop the dev-task flow is unchanged.
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
  "קרסר",
  "לקרסר",
  "קלוד",
  "לקלוד",
  "ל-קרסר",
  "ל-קלוד",
  "cursor",
  "claude",
  "ל-cursor",
  "ל-claude",
  "לcursor",
  "לclaude",
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

export type DevEscalationTier = "full" | "bugfix" | null;

/** How long an offered task stays open to the user's yes. */
export const DEV_TASK_OFFER_TTL_MS = 30 * 60 * 1000;

export interface WorkshopDevTaskInput {
  task: {
    status?: string | null;
    created_at?: string | null;
    assigned_agent?: string | null;
    requested_by_user_id?: string | null;
    source_conversation_id?: string | null;
  } | null;
  /** The user typed this turn in the app chat (a signed-in user on internal_chat). */
  appChatUser: boolean;
  /** The user's own message in this turn. */
  userText?: string | null;
  /** When this turn (the user's message) started; the task must be older. */
  turnStartedAt?: string | Date | null;
  /** This chat's conversation; the task must have been offered in it. */
  conversationId?: string | null;
  /** Who says yes: a bug-fix caller (Ana) approves only her own Cursor tasks. */
  approver?: { id?: string | null; tier?: DevEscalationTier };
  maxAgeMs?: number;
}

export type DevTaskApprovalRefusal =
  | "not_found"
  | "not_draft"
  | "no_turn"
  | "same_turn"
  | "other_conversation"
  | "expired"
  | "not_explicit"
  | "target_mismatch"
  | "bugfix_cursor_only"
  | "not_requester";

export type DevTaskApprovalDecision =
  { ok: true } | { ok: false; reason: DevTaskApprovalRefusal; message: string };

const ASK =
  "ספרי למשתמש במשפט מה המשימה ולמי היא תישלח, ושאלי אם לשלוח: [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]]. אשרי ושלחי רק אחרי 'כן' שלו בהודעה הבאה.";

const REFUSAL_MESSAGES: Record<DevTaskApprovalRefusal, string> = {
  not_found: "משימת הפיתוח לא נמצאה. בדקי את המזהה עם list_dev_tasks.",
  not_draft:
    "המשימה כבר לא מחכה לאישור (היא נשלחה, נסגרה או בוטלה). בדקי את הסטטוס עם list_dev_tasks.",
  no_turn: `בסדנה מאשרים ושולחים משימת פיתוח רק מתוך הצ׳אט, אחרי שהמשתמש ענה 'כן'. ${ASK}`,
  same_turn: `המשימה נפתחה בהודעה הזו. ${ASK}`,
  other_conversation: `המשימה לא הוצעה בשיחה הזו. ${ASK}`,
  expired: `עבר יותר מדי זמן מאז שהוצעה המשימה. ${ASK}`,
  not_explicit: `ההודעה של המשתמש היא לא אישור מפורש לשליחת המשימה. ${ASK}`,
  target_mismatch:
    "המשתמש ביקש סוכן אחר מזה שהמשימה מיועדת לו. ספרי לו למי היא מיועדת (Cursor או Claude); כדי להחליף, פתחי משימה חדשה עם הסוכן הנכון ושאלי שוב.",
  bugfix_cursor_only:
    "מותר לך לאשר רק תיקוני באגים ל-Cursor. משימה ל-Claude או לסוכן אחר מאשר רק דיוויד.",
  not_requester:
    "את המשימה הזו פתח מישהו אחר; רק הוא או דיוויד יכולים לאשר אותה.",
};

const time = (value: string | Date | null | undefined) =>
  value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""));

/** The coding agent the user's yes names ("כן, לקלוד"), if exactly one. */
export function namedDevAgent(text: unknown): "cursor" | "claude" | null {
  const t = normalizeApprovalText(text).toLowerCase();
  const cursor = /קרסר|קורסור|cursor/u.test(t);
  const claude = /קלוד|claude/u.test(t);
  if (cursor === claude) return null;
  return cursor ? "cursor" : "claude";
}

const agentOf = (task: { assigned_agent?: string | null }) =>
  String(task.assigned_agent || "cursor").toLowerCase();

/**
 * Whether approve_dev_task or dispatch_dev_task may act on this task now, in the workshop: the
 * user's message in the app chat is a plain yes, the task was offered in an earlier turn of this
 * conversation not long ago, and a yes that names an agent names this task's one.
 */
export function workshopDevTaskDecision(
  input: WorkshopDevTaskInput,
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
  const started = time(input.turnStartedAt);
  if (
    !input.appChatUser ||
    !input.conversationId ||
    !Number.isFinite(started) ||
    !String(input.userText ?? "").trim()
  )
    return refuse("no_turn");
  const created = time(task.created_at);
  if (!Number.isFinite(created) || created >= started)
    return refuse("same_turn");
  if (task.source_conversation_id !== input.conversationId)
    return refuse("other_conversation");
  if (started - created > (input.maxAgeMs ?? DEV_TASK_OFFER_TTL_MS))
    return refuse("expired");
  if (!isExplicitDevTaskApproval(input.userText)) return refuse("not_explicit");
  const named = namedDevAgent(input.userText);
  if (named && named !== agentOf(task)) return refuse("target_mismatch");
  if (input.approver?.tier === "bugfix") {
    if (agentOf(task) !== "cursor") return refuse("bugfix_cursor_only");
    const requester = task.requested_by_user_id;
    if (requester && input.approver.id && requester !== input.approver.id)
      return refuse("not_requester");
  }
  return { ok: true };
}

const WORKSHOP_OFFER =
  "ספרי במשפט מה המשימה ולמי היא תישלח, ושאלי: [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]]. " +
  "approve_dev_task ואז dispatch_dev_task רק אחרי 'כן' של המשתמש בהודעה הבאה; השרת מסרב באותה הודעה שבה נפתחה המשימה.";

/**
 * The dev-task rule in the workshop, in place of buildDevEscalationPromptRule: the workshop has
 * no connector (mcp_) or delegate_* tools, so a dev task goes only through create_dev_task and is
 * sent after the user's later yes. Each tier is told only what it may do.
 */
export function workshopDevTaskRule(tier: "full" | "bugfix"): string {
  if (tier === "full")
    return (
      "\n\n🛠️ **משימות פיתוח בסדנה (מורשה — דיוויד):** משימה ל-Cursor או ל-Claude רק דרך create_dev_task " +
      "(assigned_agent cursor או claude); בסדנה אין mcp_ ואין delegate_*. " +
      WORKSHOP_OFFER
    );
  return (
    "\n\n🐛 **תיקוני באגים בסדנה (מורשה — אנה):** מותר רק תיקון באג ל-Cursor: create_dev_task עם assigned_agent=cursor, " +
    "צעדי שחזור, התנהגות צפויה מול בפועל, ו-requested_by «Requested by Ana — BUG FIX ONLY». " +
    "אסור: פיצ'רים חדשים, שינויי הרשאות, שינויי סכמת DB, משימות ל-Claude. בקשה כזו — אמרי שרק דיוויד יכול לבקש. " +
    WORKSHOP_OFFER
  );
}
