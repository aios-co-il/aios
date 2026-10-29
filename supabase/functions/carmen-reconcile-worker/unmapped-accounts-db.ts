/**
 * What the unmapped-accounts check reads (AIO-238): the ad accounts already
 * mapped to a report or a client, and each tenant's org-level Meta
 * connections. Service role only; private tokens are never selected.
 */
import { asRecord } from "../_shared/reconcile/json.ts";
import { META_CONNECTION_TYPES } from "../_shared/reconcile/meta-token.ts";
import { META_REPORT_TYPES } from "../_shared/reconcile/run-status.ts";
import { CRM_RECORDS_PAGE_SIZE } from "../_shared/reconcile/tables.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

export type TenantConnections = {
  tenant_id: string;
  /** Org-level connections only; empty when the tenant has only private ones. */
  connections: Array<{ id: string; token: string }>;
};

/** Every Meta ad account mapped to a report table or a client, as act_<id>. */
export async function listMappedMetaAccounts(
  db: Pick<DbClient, "from">,
): Promise<Set<string>> {
  const mapped = new Set<string>();
  for (let from = 0; ; from += CRM_RECORDS_PAGE_SIZE) {
    const { data, error } = await db
      .from("crm_tables")
      .select("id, integration_settings")
      .in("integration_type", META_REPORT_TYPES)
      .order("id", { ascending: true })
      .range(from, from + CRM_RECORDS_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`crm_tables: ${error.message}`);
    }
    for (const t of data || []) {
      addAccount(mapped, asRecord(t.integration_settings).ad_account_id);
    }
    if ((data || []).length < CRM_RECORDS_PAGE_SIZE) {
      break;
    }
  }
  for (let from = 0; ; from += CRM_RECORDS_PAGE_SIZE) {
    const { data, error } = await db
      .from("clients")
      .select("id, meta_ads_account_id")
      .not("meta_ads_account_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + CRM_RECORDS_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`clients: ${error.message}`);
    }
    for (const c of data || []) {
      addAccount(mapped, c.meta_ads_account_id);
    }
    if ((data || []).length < CRM_RECORDS_PAGE_SIZE) {
      break;
    }
  }
  return mapped;
}

/**
 * The next tenant (in tenant_id order, after `afterTenantId`) with active Meta
 * connections holding their own token, with all of its org-level ones (one per
 * distinct token). A tenant whose connections are all private comes back with
 * no connections, so its run can say the check had nothing it may read. The
 * unmapped-accounts check walks tenants one at a time, so a tenant's run always
 * covers every one of its connections and there is no page cap that silently
 * ends the walk. Null once there are no more tenants.
 */
export async function nextMetaConnectionTenant(
  db: Pick<DbClient, "from">,
  afterTenantId: string | null,
): Promise<TenantConnections | null> {
  // Only tenant ids are read here; private tokens are never selected.
  let q = activeMetaConnections(db, "tenant_id");
  if (afterTenantId) {
    q = q.gt("tenant_id", afterTenantId);
  }
  const { data: next, error } = await q
    .order("tenant_id", { ascending: true })
    .limit(1);
  if (error) {
    throw new Error(`tenant_integrations: ${error.message}`);
  }
  const tenantId = next?.[0]?.tenant_id;
  if (!tenantId) {
    return null;
  }

  const seen = new Set<string>();
  const connections: TenantConnections["connections"] = [];
  for (let from = 0; ; from += CRM_RECORDS_PAGE_SIZE) {
    const { data, error: rowsErr } = await activeMetaConnections(
      db,
      "id, api_key",
    )
      .or(ORG_CONNECTION_FILTER)
      .eq("tenant_id", tenantId)
      .order("id", { ascending: true })
      .range(from, from + CRM_RECORDS_PAGE_SIZE - 1);
    if (rowsErr) {
      throw new Error(`tenant_integrations: ${rowsErr.message}`);
    }
    for (const row of data || []) {
      if (!row.api_key || seen.has(row.api_key)) {
        continue;
      }
      seen.add(row.api_key);
      connections.push({ id: row.id, token: row.api_key });
    }
    if ((data || []).length < CRM_RECORDS_PAGE_SIZE) {
      break;
    }
  }
  return { tenant_id: tenantId, connections };
}

/**
 * Org-level Meta connections only (connection_visibility 'org', or no owning
 * user). A staff member's private token can reach ad accounts of other
 * businesses they work for; those must never be listed to this tenant's owners.
 */
const ORG_CONNECTION_FILTER = "user_id.is.null,connection_visibility.eq.org";

/** Active Meta connections that hold a token, selecting `columns`. */
function activeMetaConnections<Columns extends string>(
  db: Pick<DbClient, "from">,
  columns: Columns,
) {
  return db
    .from("tenant_integrations")
    .select(columns)
    .in("integration_type", META_CONNECTION_TYPES)
    .eq("is_active", true)
    .not("api_key", "is", null);
}

/** Adds the act_<id> form of `raw` to `mapped`, when it names an account. */
function addAccount(mapped: Set<string>, raw: unknown): void {
  const id = String(raw || "")
    .trim()
    .replace(/^act_/, "");
  if (id) {
    mapped.add(`act_${id}`);
  }
}
