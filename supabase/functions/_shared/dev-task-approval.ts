/**
 * When a dev task may be approved and sent to a coding agent (Cursor or Claude), in every chat.
 * Like the workshop budget (workshop/budget.ts), the approval is the user's own message in an
 * AIOS chat, in a later turn than the one that offered the task: Carmen offers the task, and only
 * the user's "כן" in the next message approves and sends it. Nothing Carmen read or wrote in the
 * same turn can. Where the yes cannot be checked (WhatsApp, automations) a task waits for the
 * Command Center's send button (dev-tasks.ts approveOnSend).
 */

import { namedDevAgent } from "./dev-task-agents.ts";
import {
  isExplicitDevTaskApproval,
  offersDevTask,
} from "./dev-task-approval-words.ts";

export type DevEscalationTier = "full" | "bugfix" | null;

/** How long an offered task stays open to the user's yes. */
export const DEV_TASK_OFFER_TTL_MS = 30 * 60 * 1000;

/**
 * Whether approve_dev_task or dispatch_dev_task may act on this task now, in any chat: the
 * user's message in an AIOS chat is a plain yes to Carmen's previous message, which asked whether
 * to send this task (the newest one offered in this conversation, not long ago), and a yes that
 * names an agent names this task's one.
 */
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
  if (!input.appChatUser) return refuse("not_app_chat");
  const started = time(input.turnStartedAt);
  if (
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
  if (
    !offersDevTask(input.lastAssistantText) ||
    !task.id ||
    task.id !== input.offeredTaskId
  )
    return refuse("not_offered");
  const named = namedDevAgent(input.userText);
  if (named && named !== agentOf(task)) return refuse("target_mismatch");
  const bugfix = bugfixApprovalRefusal(task, input.approver);
  return bugfix ? refuse(bugfix.reason) : { ok: true };
}

/**
 * A bug-fix caller (Ana) approves and sends only Cursor tasks she asked for (or that name no
 * requester); a full caller any task. Carmen's approve_dev_task and the Command Center both
 * apply it.
 */
export function bugfixApprovalRefusal(
  task: {
    assigned_agent?: string | null;
    requested_by_user_id?: string | null;
  },
  approver: { id?: string | null; tier?: DevEscalationTier } | undefined,
): { reason: "bugfix_cursor_only" | "not_requester"; message: string } | null {
  if (approver?.tier !== "bugfix") return null;
  const requester = task.requested_by_user_id;
  const reason =
    agentOf(task) !== "cursor"
      ? "bugfix_cursor_only"
      : requester && approver.id && requester !== approver.id
        ? "not_requester"
        : null;
  return reason ? { reason, message: REFUSAL_MESSAGES[reason] } : null;
}

export interface DevTaskApprovalInput {
  task: {
    id?: string | null;
    status?: string | null;
    created_at?: string | null;
    assigned_agent?: string | null;
    requested_by_user_id?: string | null;
    source_conversation_id?: string | null;
  } | null;
  /** The user typed this turn in an AIOS chat (a signed-in user, not a service call). */
  appChatUser: boolean;
  /** The user's own message in this turn. */
  userText?: string | null;
  /** When this turn (the user's message) started; the task must be older. */
  turnStartedAt?: string | Date | null;
  /** This chat's conversation; the task must have been offered in it. */
  conversationId?: string | null;
  /** Carmen's previous message in this chat; it must ask whether to send the task. */
  lastAssistantText?: string | null;
  /** The newest open task of this conversation from before this turn: the one she offered. */
  offeredTaskId?: string | null;
  /** Who says yes: a bug-fix caller (Ana) approves only her own Cursor tasks. */
  approver?: { id?: string | null; tier?: DevEscalationTier };
  maxAgeMs?: number;
}

export type DevTaskApprovalRefusal =
  | "not_found"
  | "not_draft"
  | "not_app_chat"
  | "no_turn"
  | "same_turn"
  | "other_conversation"
  | "expired"
  | "not_explicit"
  | "not_offered"
  | "target_mismatch"
  | "bugfix_cursor_only"
  | "not_requester";

export type DevTaskApprovalDecision =
  { ok: true } | { ok: false; reason: DevTaskApprovalRefusal; message: string };

const ASK =
  "ספרי למשתמש במשפט מה המשימה ולמי היא תישלח, ושאלי אם לשלוח: [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]]. אשרי ושלחי רק אחרי 'כן' שלו בהודעה הבאה.";

/** Where the user's yes cannot be checked, a task waits for a person in the Command Center. */
export const NOT_APP_CHAT =
  "מכאן (וואטסאפ, אוטומציה) לא מאשרים ולא שולחים משימת פיתוח: את ה'כן' של המשתמש בודקים רק בצ׳אט של AIOS. אם עוד אין משימה, פתחי אותה עם create_dev_task, ואמרי למשתמש שהיא מחכה לאישור שלו במרכז משימות הפיתוח באפליקציה (כפתור 'שלח').";

const REFUSAL_MESSAGES: Record<DevTaskApprovalRefusal, string> = {
  not_found: "משימת הפיתוח לא נמצאה. בדקי את המזהה עם list_dev_tasks.",
  not_draft:
    "המשימה כבר לא מחכה לאישור (היא נשלחה, נסגרה או בוטלה). בדקי את הסטטוס עם list_dev_tasks.",
  not_app_chat: NOT_APP_CHAT,
  no_turn: `מאשרים ושולחים משימת פיתוח רק מתוך הצ׳אט, אחרי שהמשתמש ענה 'כן'. ${ASK}`,
  same_turn: `המשימה נפתחה בהודעה הזו. ${ASK}`,
  other_conversation: `המשימה לא הוצעה בשיחה הזו. ${ASK}`,
  expired: `עבר יותר מדי זמן מאז שהוצעה המשימה. ${ASK}`,
  not_explicit: `ההודעה של המשתמש היא לא אישור מפורש לשליחת המשימה. ${ASK}`,
  not_offered: `ההודעה הקודמת שלך לא שאלה אם לשלוח את המשימה הזו, אז ה'כן' של המשתמש לא מאשר אותה. ${ASK}`,
  target_mismatch:
    "המשתמש ביקש סוכן אחר מזה שהמשימה מיועדת לו. ספרי לו למי היא מיועדת (Cursor או Claude); כדי להחליף, פתחי משימה חדשה עם הסוכן הנכון ושאלי שוב.",
  bugfix_cursor_only:
    "מותר לך לאשר רק תיקוני באגים ל-Cursor. משימה ל-Claude או לסוכן אחר מאשר רק דיוויד.",
  not_requester:
    "את המשימה הזו פתח מישהו אחר; רק הוא או דיוויד יכולים לאשר אותה.",
};

const time = (value: string | Date | null | undefined) =>
  value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""));

const agentOf = (task: { assigned_agent?: string | null }) =>
  String(task.assigned_agent || "cursor").toLowerCase();
