/**
 * When a dev task may be approved and sent to a coding agent (Cursor or Claude), in every chat.
 * Like the workshop budget (workshop/budget.ts), the approval is the user's own message in an
 * AIOS chat, in a later turn than the one that offered the task: Carmen offers the task, and only
 * the user's "כן" in the next message approves and sends it. Nothing Carmen read or wrote in the
 * same turn can. Where the yes cannot be checked (WhatsApp, automations) a task waits for the
 * Command Center's send button (dev-tasks.ts approveOnSend).
 */
import {
  isExplicitApprovalPhrase,
  isExplicitRejectionPhrase,
  normalizeApprovalText,
} from "./wa-approval-flow.ts";
import { logDevTaskEvent } from "./dev-tasks.ts";
import { askedChoices } from "./workshop/tapped-answers.ts";

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

/** The coding agents Carmen sends work to, by the names users write for them. */
const AGENT_SPELLINGS = {
  cursor: ["קרסר", "קורסור", "cursor"],
  claude: ["קלוד", "claude"],
  grok: ["גרוק", "grok"],
  manus: ["מנוס", "מאנוס", "manus"],
  github: ["גיטהאב", "github"],
};

export type DevAgent = keyof typeof AGENT_SPELLINGS;

const AGENT_WORDS = Object.values(AGENT_SPELLINGS).flat();

/** One of these names as a word of its own, maybe after "ל" ("לקרסר"): "מנוסה" is not Manus. */
const asWord = (names: string[]) =>
  `(?<![א-תa-z0-9])(?:ו?ל-?)?(?:${names.join("|")})(?![א-תa-z0-9])`;

const AGENT_NAME = Object.fromEntries(
  Object.entries(AGENT_SPELLINGS).map(([agent, names]) => [
    agent,
    new RegExp(asWord(names), "iu"),
  ]),
) as Record<DevAgent, RegExp>;

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

export type DevEscalationTier = "full" | "bugfix" | null;

/** How long an offered task stays open to the user's yes. */
export const DEV_TASK_OFFER_TTL_MS = 30 * 60 * 1000;

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
const NOT_APP_CHAT =
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

/** The coding agent the user's yes names ("כן, לקלוד"), if exactly one. */
export function namedDevAgent(text: unknown): DevAgent | null {
  const t = normalizeApprovalText(text);
  const named = (Object.keys(AGENT_NAME) as DevAgent[]).filter((agent) =>
    AGENT_NAME[agent].test(t),
  );
  return named.length === 1 ? named[0] : null;
}

const agentOf = (task: { assigned_agent?: string | null }) =>
  String(task.assigned_agent || "cursor").toLowerCase();

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

/** A connector's tool that starts new work at a coding agent: a dev task or a research run. */
const CONNECTOR_SEND =
  /^(?:mcp_([A-Za-z0-9_-]+?)__)?(?:request_dev_task|ask_(cursor|claude|grok|manus))$/;

/**
 * The coding agent a tool call starts, or undefined when it starts none: a connector's
 * request_dev_task or ask_* (Cursor, Claude, Grok, Manus), the GitHub agent, or Cursor through
 * the CRM task queue. Replying into a session the user already sent (reply_to_cursor_session)
 * or moving the queue on (complete_human_task) starts none. The agent is null when the
 * connector's name does not say which one it is.
 */
function codingAgentStarted(
  toolName: string,
  args: Record<string, unknown>,
): DevAgent | null | undefined {
  if (toolName === "delegate_to_github_agent") return "github";
  if (toolName === "assign_task_to_cursor") return "cursor";
  // take_task hands a task to Cursor's queue when agent_name names Cursor (run-ai-agent).
  if (toolName === "take_task")
    return /cursor/i.test(String(args.agent_name ?? "")) ? "cursor" : undefined;
  const match = CONNECTOR_SEND.exec(toolName);
  if (!match) return undefined;
  const [, connection, asked] = match;
  if (asked) return asked as DevAgent;
  // The bare legacy request_dev_task is Cursor's; a connection is named after its agent.
  if (!connection) return "cursor";
  const named = (Object.keys(AGENT_SPELLINGS) as DevAgent[]).filter((agent) =>
    connection.toLowerCase().includes(agent),
  );
  return named.length === 1 ? named[0] : null;
}

const DIRECT_ASK =
  "ספרי למשתמש במשפט מה תשלחי ולמי (Cursor, Claude, Grok, Manus או סוכן GitHub), ושאלי: [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]]. שולחים רק אחרי 'כן' שלו בהודעה הבאה; השרת מסרב באותה הודעה שבה ביקש.";

const DIRECT_MISMATCH =
  "המשתמש ביקש סוכן אחר מזה שאת שולחת אליו. ספרי לו למי זה נשלח, ושאלי שוב: [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]].";

/**
 * Why a tool call that starts a coding agent (mcp_Cursor__request_dev_task, mcp_Grok__ask_grok,
 * delegate_to_github_agent, assign_task_to_cursor, ...) may not run now, or null: like a dev
 * task, it waits for the user's own plain yes in an AIOS chat to Carmen's previous message,
 * which offered it, and a yes that names an agent names this one. Other tools are never refused.
 */
export function directDevSendRefusal(
  toolName: string,
  turn: {
    appChatUser: boolean;
    userText?: string | null;
    lastAssistantText?: string | null;
  },
  args: Record<string, unknown> = {},
): { error: string; message: string } | null {
  const agent = codingAgentStarted(toolName, args);
  if (agent === undefined) return null;
  if (!turn.appChatUser)
    return { error: "dev_task_approval_not_app_chat", message: NOT_APP_CHAT };
  if (
    !isExplicitDevTaskApproval(turn.userText) ||
    !offersDevTask(turn.lastAssistantText)
  )
    return { error: "dev_send_needs_yes", message: DIRECT_ASK };
  const named = namedDevAgent(turn.userText);
  if (named && named !== agent)
    return {
      error: "dev_task_approval_target_mismatch",
      message: DIRECT_MISMATCH,
    };
  return null;
}

/** The tools that start a coding agent, as Carmen's rules name them. */
const DIRECT_SENDS =
  "request_dev_task ו-ask_* של mcp_Cursor__, mcp_Claude__, mcp_Grok__ ו-mcp_Manus__, delegate_to_github_agent, assign_task_to_cursor";

/**
 * How a dev task is sent outside the workshop, for a caller allowed to send one: in an AIOS chat
 * Carmen offers it and sends it after the user's yes in the next message; where the yes cannot
 * be checked she only opens it, and a person sends it from the Command Center.
 */
export function devTaskSendRule(appChat: boolean): string {
  return appChat
    ? `\n\n✋ **שליחה לסוכן קוד (חובה):** משימת פיתוח (create_dev_task) או שליחה ישירה (${DIRECT_SENDS}): ספרי במשפט מה תשלחי ולמי, ושאלי: [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]]. ` +
        "approve_dev_task ואז dispatch_dev_task (או השליחה הישירה) רק אחרי 'כן' של המשתמש בהודעה הבאה; השרת מסרב באותה הודעה, גם כשהמשתמש כבר כתב 'שלחי'. " +
        "תשובה בתוך סשן שהמשתמש כבר שלח (reply_to_cursor_session) לא צריכה אישור חדש."
    : `\n\n✋ **שליחה לסוכן קוד (חובה, גובר על כל הנחיה אחרת):** מכאן לא שולחים לאף סוכן קוד (${DIRECT_SENDS}): פתחי משימה עם create_dev_task, ואמרי למשתמש שהיא מחכה לאישור שלו במרכז משימות הפיתוח באפליקציה (כפתור 'שלח').`;
}

const WORKSHOP_OFFER =
  "ספרי במשפט מה המשימה ולמי היא תישלח, ושאלי: [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]]. " +
  "approve_dev_task ואז dispatch_dev_task רק אחרי 'כן' של המשתמש בהודעה הבאה, כתשובה לשאלה הזו; השרת מסרב באותה הודעה שבה נפתחה המשימה. " +
  "'לא' של המשתמש מבטל את המשימה.";

type Db = { from: (table: string) => any };

/**
 * The task Carmen offered in this conversation: the newest one still open to a yes (draft, or
 * approved and not yet sent), opened before this turn and not long ago.
 */
export async function findOfferedDevTask(
  supabase: Db,
  args: { tenantId: string; conversationId: string; turnStartedAt: string },
): Promise<{
  id: string;
  title?: string | null;
  assigned_agent?: string | null;
  status?: string | null;
} | null> {
  const started = Date.parse(args.turnStartedAt);
  if (!Number.isFinite(started)) return null;
  const { data } = await supabase
    .from("dev_tasks")
    .select("id, title, assigned_agent, status")
    .eq("tenant_id", args.tenantId)
    .eq("source_conversation_id", args.conversationId)
    .in("status", ["draft", "approved"])
    .lt("created_at", args.turnStartedAt)
    .gte("created_at", new Date(started - DEV_TASK_OFFER_TTL_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? data : null;
}

/** The user said no to the offered task: cancel it, so no later yes can send it. */
export async function declineOfferedDevTask(
  supabase: Db,
  args: { tenantId: string; taskId: string; actorUserId?: string | null },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("dev_tasks")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", args.taskId)
    .eq("tenant_id", args.tenantId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error || !data?.id) return false;
  await logDevTaskEvent(supabase, {
    devTaskId: args.taskId,
    tenantId: args.tenantId,
    eventType: "declined",
    actorUserId: args.actorUserId ?? null,
    detail: { via: "workshop_chat" },
  });
  return true;
}

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
