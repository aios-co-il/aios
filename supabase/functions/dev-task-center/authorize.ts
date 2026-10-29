/**
 * Who may approve or send a dev task from the Command Center (dev-task-center approve and
 * dispatch). Send on a draft also approves it as the caller (dev-tasks.ts approveOnSend), so the
 * same people may do both.
 */
import {
  bugfixApprovalRefusal,
  type DevEscalationTier,
} from "../_shared/dev-task-approval.ts";

/** The caller as the handler verified them. */
export type DevTaskCenterCaller =
  | { kind: "service" }
  | {
      kind: "user";
      userId: string;
      /** A member of the task's tenant, or a super admin (userHasTenantAccess). */
      tenantAccess: boolean;
      /** Their dev-escalation tier, as Carmen's tools load it (loadDevEscalationTierFromDb). */
      tier: DevEscalationTier;
    };

export type DevTaskSendAuthorization =
  { ok: true } | { ok: false; status: 403 | 404; code: string; error: string };

const FORBIDDEN =
  "אין לך הרשאה לאשר או לשלוח משימות פיתוח בארגון הזה. רק דיוויד, או אנה לתיקוני באגים ל-Cursor, מאשרים ושולחים.";

/**
 * Whether this caller may approve or send this task: the service role, or a person with access
 * to the task's tenant whose dev-escalation tier allows it. A bug-fix caller sends only Cursor
 * tasks they asked for, as in Carmen's approve_dev_task. A missing task is a 404 only for a
 * caller who may send tasks there.
 */
export function devTaskSendAuthorization(
  caller: DevTaskCenterCaller,
  task: {
    assigned_agent?: string | null;
    requested_by_user_id?: string | null;
  } | null,
): DevTaskSendAuthorization {
  if (caller.kind === "user" && (!caller.tenantAccess || !caller.tier))
    return {
      ok: false,
      status: 403,
      code: "dev_task_send_forbidden",
      error: FORBIDDEN,
    };
  if (!task)
    return {
      ok: false,
      status: 404,
      code: "not_found",
      error: "dev_task not found",
    };
  if (caller.kind === "service") return { ok: true };
  const bugfix = bugfixApprovalRefusal(task, {
    id: caller.userId,
    tier: caller.tier,
  });
  return bugfix
    ? { ok: false, status: 403, code: bugfix.reason, error: bugfix.message }
    : { ok: true };
}
