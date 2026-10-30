/**
 * The Meta report tables verify_report_vs_meta checks (AIO-238): every one in
 * the caller's scope, paged, with no cap.
 */
import { META_REPORT_TYPES } from "../_shared/reconcile/run-status.ts";
import { listReconcileTables } from "../_shared/reconcile/tables.ts";
import type { ListedTable } from "../_shared/reconcile/types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

const PAGE_SIZE = 500;

/** Meta report tables with an ad account; without a client, only active clients' tables. */
export async function listVerifyTables(
  db: Pick<DbClient, "from">,
  opts: {
    tenantIds: string[];
    clientId?: string | null;
    agencyName?: string | null;
  },
): Promise<ListedTable[]> {
  const out: ListedTable[] = [];
  let afterId: string | null = null;
  for (;;) {
    const page = await listReconcileTables(db, {
      afterId,
      limit: PAGE_SIZE,
      tenantIds: opts.tenantIds,
      clientId: opts.clientId || null,
      integrationTypes: META_REPORT_TYPES,
    });
    out.push(...page);
    if (page.length < PAGE_SIZE) {
      break;
    }
    afterId = page[page.length - 1].id;
  }
  const agency = String(opts.agencyName || "").toLowerCase();
  return out.filter((t) => inScope(t, opts.clientId, agency));
}

/** Has an ad account, belongs to an active client (unless one was asked for) and matches the agency filter. */
function inScope(
  t: ListedTable,
  clientId: string | null | undefined,
  agency: string,
): boolean {
  if (!t.integration_settings?.ad_account_id) {
    return false;
  }
  if (!clientId && (!t.client_id || t.client_status !== "active")) {
    return false;
  }
  return (
    !agency ||
    String(t.agency_name || "")
      .toLowerCase()
      .includes(agency)
  );
}
