/** The rules Carmen follows to send work to a coding agent, and the server's check on each send. */
import {
  AGENT_SPELLINGS,
  type DevAgent,
  namedDevAgent,
} from "./dev-task-agents.ts";
import { NOT_APP_CHAT } from "./dev-task-approval.ts";
import {
  isExplicitDevTaskApproval,
  offersDevTask,
} from "./dev-task-approval-words.ts";

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

/** The tools that start a coding agent, as Carmen's rules name them. */
const DIRECT_SENDS =
  "request_dev_task ו-ask_* של mcp_Cursor__, mcp_Claude__, mcp_Grok__ ו-mcp_Manus__, delegate_to_github_agent, assign_task_to_cursor";

const WORKSHOP_OFFER =
  "ספרי במשפט מה המשימה ולמי היא תישלח, ושאלי: [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]]. " +
  "approve_dev_task ואז dispatch_dev_task רק אחרי 'כן' של המשתמש בהודעה הבאה, כתשובה לשאלה הזו; השרת מסרב באותה הודעה שבה נפתחה המשימה. " +
  "'לא' של המשתמש מבטל את המשימה.";
