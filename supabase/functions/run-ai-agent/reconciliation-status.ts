/**
 * get_reconciliation_status (AIO-238): the latest stored nightly result per
 * report table (and per tenant for the unmapped-accounts check), limited to
 * what the caller may see. Reads stored runs only; never calls the platforms.
 */
import {
  assertCallerCanAccessClient,
  type CallerScope,
} from "../_shared/auth-helpers.ts";
import { RECONCILE_RESULT_MAX_AGE_MS } from "../_shared/reconcile/run-status.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { MANAGER_ROLES } from "./manager-roles.ts";
import { latestPerKey, rank, runKey, toStatusItem } from "./status-items.ts";
import { scopedRuns } from "./status-runs.ts";
import {
  clientInScope,
  reconcileStatusScope,
  rolesInTenant,
} from "./status-scope.ts";

const RATE_LIMITED_NOTE =
  "הדוחות האלה לא נבדקו בבדיקה האחרונה כי הפלטפורמה הגבילה את קצב הבקשות, אז אי אפשר לומר שהם תואמים. התוצאה של הבדיקה הקודמת שלהם, אם יש, מופיעה ב-previous";

/**
 * The tool call: managers may ask for every client; anyone else names a client
 * they can access. Manager means a manager role in this tenant, not the
 * caller's highest role in any tenant (run-ai-agent's callerRole).
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

/**
 * Latest run per table (and per tenant for the unmapped-accounts check) since
 * `sinceIso`, limited to what the caller may see (see reconcileStatusScope).
 * The top findings come from the run summary (top_findings), so one query per
 * scope part answers it. Callers use a service-role client, so this scoping is
 * the access check.
 */
export async function getReconciliationStatus(
  db: Pick<DbClient, "from">,
  opts: {
    tenantId: string;
    callerRoles: string[];
    clientId?: string | null;
    sinceIso: string;
  },
) {
  const scope = await reconcileStatusScope(db, opts);
  if (opts.clientId && !(await clientInScope(db, scope, opts.clientId))) {
    throw new Error("הלקוח לא נמצא או מחוץ להרשאה שלך");
  }
  const runs = await scopedRuns(
    db,
    scope,
    opts.clientId || null,
    opts.sinceIso,
  );
  const { latest, previous } = latestPerKey(runs);
  const kept = [...latest.values()];
  const items = kept
    .map((run) => toStatusItem(run, previous.get(runKey(run))))
    .sort((a, b) => rank(a.status) - rank(b.status));
  const count = (status: string) =>
    items.filter((i) => i.status === status).length;
  const rateLimited = items.filter((i) => i.rate_limited);
  return {
    since: opts.sinceIso,
    last_run_at: kept[0]?.started_at || null,
    checked: items.length,
    ok: count("ok"),
    with_gaps: count("mismatch"),
    failed: count("failed"),
    skipped: count("skipped"),
    ...(rateLimited.length
      ? {
          rate_limited_tables: rateLimited.map((i) => ({
            client: i.client,
            table: i.table,
            platform: i.platform,
            attempted_at: i.checked_at,
          })),
          rate_limited_note: RATE_LIMITED_NOTE,
        }
      : {}),
    items,
  };
}
