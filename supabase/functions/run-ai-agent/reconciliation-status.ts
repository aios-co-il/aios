/**
 * get_reconciliation_status (AIO-238): the latest stored nightly result per
 * report table (and per tenant for the unmapped-accounts check), limited to
 * what the caller may see. Reads stored runs only; never calls the platforms.
 * The tool call's role gate is in status-tool.ts.
 */
import type { DbClient } from "../_shared/supabase-clients.ts";
import { latestPerKey, rank, runKey, toStatusItem } from "./status-items.ts";
import { scopedRuns } from "./status-runs.ts";
import { clientInScope, reconcileStatusScope } from "./status-scope.ts";

const RATE_LIMITED_NOTE =
  "הדוחות האלה לא נבדקו בבדיקה האחרונה כי הפלטפורמה הגבילה את קצב הבקשות, אז אי אפשר לומר שהם תואמים. התוצאה של הבדיקה הקודמת שלהם, אם יש, מופיעה ב-previous";

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
