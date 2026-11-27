/**
 * Whether the caller may claim or complete an action: it is their own row, and they may act
 * in its org now (a member of it, or a super admin), the rule run-ai-agent applied when it
 * wrote the row (`_shared/agent-runs/run-tenant-access.ts`).
 *
 * The row is read with the service role, not as the caller: the table's row-level security
 * shows a super admin their own rows only in the org `user_active_tenant` names, one row per
 * user that every site tab, the extension's popup and its recorder rewrite, so the panel's
 * claim failed whenever another surface had moved that row off the org the chat ran in.
 * The browser's own read of the table is unchanged.
 */
import { tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import { type OwnAction, readAction, type ServiceDb } from "./rows.ts";

/** The action, or why the caller may not take it (for the log, never the answer). */
export type CallerAction = { action: OwnAction } | { refusal: string };

/** The action when it is the caller's and they may act in its org. Throws when a read fails. */
export async function callerAction(
  serviceDb: ServiceDb,
  id: string,
  userId: string,
): Promise<CallerAction> {
  const action = await readAction(serviceDb, id);
  if (!action || action.user_id !== userId) {
    return { refusal: "not the caller's row" };
  }

  // The org comes from the row the server wrote, and the caller's right to it is checked here.
  const access = await tenantUserAccess(serviceDb, action.tenant_id, userId);
  return access.member || access.superAdmin
    ? { action }
    : { refusal: "the caller may not act in the row's org" };
}
