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

export interface DevTaskApprovalInput {
  task: {
    status?: string | null;
    created_at?: string | null;
    assigned_agent?: string | null;
    requested_by_user_id?: string | null;
  } | null;
  /** The user's own message in this turn. */
  userText?: string | null;
  /** When this turn (the user's message) started; the task must be older. */
  turnStartedAt?: string | Date | null;
  /** David approved this exact call in the approvals queue. */
  outOfBand?: boolean;
  /** Who says yes: a bug-fix caller (Ana) approves only her own Cursor tasks. */
  approver?: { id?: string | null; tier?: DevEscalationTier };
}

export type DevTaskApprovalRefusal =
  | "not_found"
  | "not_draft"
  | "no_turn"
  | "same_turn"
  | "not_explicit"
  | "target_mismatch"
  | "bugfix_cursor_only"
  | "not_requester";

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

/**
 * A draft dev task Carmen offered in this conversation a moment ago, which the user's yes now
 * answers. The newest; null when none (a yes then goes to the approvals queue as before).
 */
export function pickOfferedDevTask<
  T extends {
    status?: string | null;
    created_at?: string | null;
    source_conversation_id?: string | null;
    requested_by_user_id?: string | null;
  },
>(
  rows: T[] | null | undefined,
  ctx: {
    conversationId?: string | null;
    userId?: string | null;
    turnStartedAt: string | Date;
    maxAgeMs?: number;
  },
): T | null {
  const started = time(ctx.turnStartedAt);
  const maxAge = ctx.maxAgeMs ?? 30 * 60 * 1000;
  const fits = (row: T) => {
    if (row.status !== "draft") return false;
    const created = time(row.created_at);
    if (!Number.isFinite(created) || created >= started) return false;
    if (started - created > maxAge) return false;
    if (ctx.conversationId && row.source_conversation_id)
      return row.source_conversation_id === ctx.conversationId;
    return !!ctx.userId && row.requested_by_user_id === ctx.userId;
  };
  const list = (rows || []).filter(fits);
  list.sort((a, b) => time(b.created_at) - time(a.created_at));
  return list[0] ?? null;
}

/** Fields that change what is sent to the coding agent. */
const CONTENT_KEYS = new Set([
  "title",
  "problem",
  "expected_behavior",
  "current_behavior",
  "scope",
  "affected_areas",
  "constraints",
  "acceptance_criteria",
  "base_branch",
  "environment",
  "assigned_agent",
]);

export const DEV_TASK_STATUS_APPROVED_HE =
  "אי אפשר לסמן משימה כמאושרת בעדכון. מאשרים רק עם approve_dev_task, אחרי 'כן' של המשתמש בהודעה נפרדת.";

/**
 * The update a dev task gets. No update sets the approval: only approve_dev_task approves. An
 * edit to what will be sent puts a waiting (draft or approved) task back to draft, so the user
 * approves what actually goes out.
 */
export function devTaskUpdatePatch(
  current: { status?: string | null } | null,
  fields: Record<string, unknown>,
  allowed: readonly string[],
  now: string = new Date().toISOString(),
):
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: "dev_task_status_approved"; message: string } {
  const patch: Record<string, unknown> = { updated_at: now };
  for (const key of allowed)
    if (fields[key] !== undefined) patch[key] = fields[key];
  if (patch.status === "approved")
    return {
      ok: false,
      error: "dev_task_status_approved",
      message: DEV_TASK_STATUS_APPROVED_HE,
    };
  const waiting = current?.status === "draft" || current?.status === "approved";
  const edited = Object.keys(patch).some((key) => CONTENT_KEYS.has(key));
  if ((waiting && edited) || patch.status === "draft") {
    patch.status = "draft";
    patch.approved_by = null;
    patch.approved_at = null;
  }
  return { ok: true, patch };
}

/** Coding-agent tools that send a new task at once, with no dev_tasks record to approve. */
const DIRECT_SEND =
  /^(mcp_(Cursor|Claude)__request_dev_task|assign_task_to_cursor)$/;

export const DIRECT_DEV_SEND_HE =
  "שליחה לסוכן קוד יוצאת רק אחרי 'כן' מפורש של המשתמש בהודעה נפרדת. פתחי create_dev_task, ספרי במשפט מה תשלחי ולמי (Cursor או Claude) ושאלי אם לשלוח; אחרי ה'כן' — approve_dev_task ואז dispatch_dev_task.";

/** Why a tool that sends straight to Cursor or Claude may not run now; null when it may. */
export function directDevSendRefusal(
  toolName: string,
  userText: unknown,
): { error: "dev_send_needs_approval"; message: string } | null {
  if (!DIRECT_SEND.test(String(toolName || ""))) return null;
  if (isExplicitDevTaskApproval(userText)) return null;
  return { error: "dev_send_needs_approval", message: DIRECT_DEV_SEND_HE };
}

/** Dev Task Center actions that change a task or send it. */
const CENTER_WRITES = new Set([
  "create",
  "update",
  "approve",
  "dispatch",
  "attach_session",
  "cancel",
  "mark_done",
]);

/**
 * Who may use the Dev Task Center for a tenant: the service role always; a signed-in user only
 * as a member of the tenant (or a super admin), and changes or sends only with a dev-escalation
 * tier. A bug-fix caller works only on Cursor tasks.
 */
export function devTaskCenterRefusal(input: {
  action: string;
  service: boolean;
  member: boolean;
  tier: DevEscalationTier;
  /** The agent the task is or will be assigned to (create, update, approve, dispatch). */
  agent?: string | null;
}): { status: 403; error: string } | null {
  if (input.service) return null;
  if (!input.member) return { status: 403, error: "אין לך גישה לעסק הזה." };
  if (!CENTER_WRITES.has(input.action)) return null;
  if (!input.tier)
    return {
      status: 403,
      error:
        "רק דיוויד (או אנה לתיקוני באגים) יכולים לפתוח, לאשר ולשלוח משימות פיתוח.",
    };
  if (
    input.tier === "bugfix" &&
    input.agent != null &&
    String(input.agent || "cursor").toLowerCase() !== "cursor"
  )
    return { status: 403, error: "מותר לך לעבוד רק על תיקוני באגים ל-Cursor." };
  return null;
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
