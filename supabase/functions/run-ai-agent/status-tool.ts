/**
 * The get_reconciliation_status tool call (AIO-238): which clients a caller
 * may ask about, by the roles they hold in this tenant.
 */
import {
  assertCallerCanAccessClient,
  type CallerScope,
} from "../_shared/auth-helpers.ts";
import { RECONCILE_RESULT_MAX_AGE_MS } from "../_shared/reconcile/run-status.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { MANAGER_ROLES } from "./manager-roles.ts";
import { getReconciliationStatus } from "./reconciliation-status.ts";
import { rolesInTenant } from "./status-scope.ts";

/**
 * Managers may ask for every client; anyone else names a client they can
 * access. Manager means a manager role in this tenant, not the caller's
 * highest role in any tenant (run-ai-agent's callerRole).
 */
export async function reconciliationStatusTool(
  ctx: {
    supabase: Pick<DbClient, "from">;
    callerScope: CallerScope;
    tenantId: string;
    actorUserId: string | null;
  },
  args: { client_id?: string | null },
) {
  const callerRoles = await rolesInTenant(
    ctx.supabase,
    ctx.tenantId,
    ctx.actorUserId,
  );
  const isManager = callerRoles.some((role) => MANAGER_ROLES.includes(role));
  if (args.client_id) {
    await assertCallerCanAccessClient(ctx.supabase, args.client_id, {
      ...ctx.callerScope,
      isManagerRole: isManager,
    });
  } else if (!isManager) {
    throw new Error(
      "סטטוס ההתאמה לכל הלקוחות זמין למנהלים בלבד — העבירי client_id",
    );
  }
  // Scoped inside: own tenant + shared-agency clients; account-level rows for owners only.
  return await getReconciliationStatus(ctx.supabase, {
    tenantId: ctx.tenantId,
    callerRoles,
    clientId: args.client_id || null,
    sinceIso: new Date(Date.now() - RECONCILE_RESULT_MAX_AGE_MS).toISOString(),
  });
}
