/**
 * Database side of the reconciliation (AIO-238): which tables to check, the
 * stored campaign rows (paginated), the connection each table syncs with, and
 * the reconcile_runs / reconcile_findings rows. Callers pass a service-role
 * client; scoping to what a person may see is the caller's job.
 */
import {
  type CampaignDayRow,
  CallBudget,
  isCampaignLevel,
  RECONCILE_INTEGRATION_TYPES,
  type ReconcileFinding,
  type ReconcileTable,
  ReconcileSourceError,
  type RunStatus,
} from "./reconcile-core.ts";
import {
  type GoogleAuth,
  googleCustomerId,
  requestTimeout,
} from "./reconcile-sources.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export const CRM_RECORDS_PAGE_SIZE = 1000;
const MAX_RECORD_PAGES = 200;

export type ListedTable = ReconcileTable & {
  client_name: string | null;
  client_status: string | null;
  agency_name: string | null;
};

const TABLE_COLUMNS =
  "id, tenant_id, client_id, name, integration_type, integration_settings, category, last_sync_at, clients(name, status, agencies(name))";

function toListed(row: Record<string, any>): ListedTable {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    client_id: row.client_id ?? null,
    name: row.name ?? null,
    integration_type: row.integration_type,
    integration_settings: row.integration_settings || {},
    category: row.category ?? null,
    last_sync_at: row.last_sync_at ?? null,
    client_name: row.clients?.name ?? null,
    client_status: row.clients?.status ?? null,
    agency_name: row.clients?.agencies?.name ?? null,
  };
}

/** Report tables with an active campaign flag, in id order after `afterId`. */
export async function listReconcileTables(
  db: Db,
  opts: {
    afterId?: string | null;
    limit: number;
    tenantIds?: string[] | null;
    clientId?: string | null;
    tableIds?: string[] | null;
    integrationTypes?: readonly string[];
  },
): Promise<ListedTable[]> {
  let query = db
    .from("crm_tables")
    .select(TABLE_COLUMNS)
    .in("integration_type", [
      ...(opts.integrationTypes || RECONCILE_INTEGRATION_TYPES),
    ])
    .eq("campaign_active", true);
  if (opts.afterId) query = query.gt("id", opts.afterId);
  if (opts.tenantIds?.length) query = query.in("tenant_id", opts.tenantIds);
  if (opts.clientId) query = query.eq("client_id", opts.clientId);
  if (opts.tableIds?.length) query = query.in("id", opts.tableIds);
  const { data, error } = await query
    .order("id", { ascending: true })
    .limit(opts.limit);
  if (error) throw new Error(`crm_tables: ${error.message}`);
  return (data || []).map(toListed);
}

/**
 * Stored campaign rows for a table and date range, read page by page (PostgREST
 * caps a single response). Rows without entity_level are legacy campaign rows.
 */
export async function readAiosCampaignRows(
  db: Db,
  tableId: string,
  start: string,
  end: string,
  pageSize = CRM_RECORDS_PAGE_SIZE,
): Promise<CampaignDayRow[]> {
  const rows: CampaignDayRow[] = [];
  for (let page = 0; ; page++) {
    if (page >= MAX_RECORD_PAGES)
      throw new Error(`crm_records: more than ${MAX_RECORD_PAGES} pages`);
    const from = page * pageSize;
    const { data, error } = await db
      .from("crm_records")
      .select("id, data")
      .eq("table_id", tableId)
      .gte("data->>date", start)
      .lte("data->>date", end)
      .or("data->>entity_level.is.null,data->>entity_level.eq.campaign")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`crm_records: ${error.message}`);
    const batch = data || [];
    for (const rec of batch) {
      const d = (rec?.data || {}) as Record<string, unknown>;
      if (!isCampaignLevel(d)) continue;
      const date = String(d.date || "").slice(0, 10);
      if (!date) continue;
      rows.push({
        campaign_id: String(d.campaign_id || ""),
        campaign_name: (d.campaign_name as string) || null,
        date,
        data: d,
      });
    }
    if (batch.length < pageSize) return rows;
  }
}

// ── Connections ────────────────────────────────────────────────────────────

const META_TYPES = ["facebook", "facebook_lead_ads"];

async function agencySourceTenants(db: Db, tenantId: string) {
  const { data } = await db
    .from("agency_tenant_access")
    .select("source_tenant_id")
    .eq("accessing_tenant_id", tenantId);
  return (data || [])
    .map((r: { source_tenant_id: string | null }) => r.source_tenant_id)
    .filter(Boolean) as string[];
}

async function withSharedKey(
  db: Db,
  row: { api_key?: string | null; shared_from_integration_id?: string | null },
): Promise<string | null> {
  if (row?.api_key) return row.api_key;
  if (!row?.shared_from_integration_id) return null;
  const { data } = await db
    .from("tenant_integrations")
    .select("api_key")
    .eq("id", row.shared_from_integration_id)
    .eq("is_active", true)
    .maybeSingle();
  return data?.api_key || null;
}

/**
 * The Meta token a table syncs with, in the same order as sync-facebook-insights:
 * the connection pinned on the table, then an org/private one on its tenant, then
 * any active one on its tenant. The sync never borrows another tenant's token,
 * so the nightly worker does not either; only Carmen's on-demand check passes
 * `fallbackTenantIds` (the caller's own tenant, as before).
 */
export async function resolveMetaToken(
  db: Db,
  table: ReconcileTable,
  fallbackTenantIds: string[] = [],
): Promise<string | null> {
  const settings = table.integration_settings || {};
  const pinned = settings.integration_id || settings.integrationId;
  if (pinned) {
    const { data } = await db
      .from("tenant_integrations")
      .select("api_key, shared_from_integration_id")
      .eq("id", pinned)
      .in("integration_type", META_TYPES)
      .eq("is_active", true)
      .maybeSingle();
    const key = data ? await withSharedKey(db, data) : null;
    if (key) return key;
  }
  const newest = async (tenantId: string, visibility?: string[]) => {
    let q = db
      .from("tenant_integrations")
      .select("api_key, shared_from_integration_id")
      .eq("tenant_id", tenantId)
      .in("integration_type", META_TYPES)
      .eq("is_active", true);
    if (visibility) q = q.in("connection_visibility", visibility);
    const { data } = await q
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? withSharedKey(db, data) : null;
  };
  const own =
    (await newest(table.tenant_id, ["org", "private"])) ||
    (await newest(table.tenant_id));
  if (own) return own;
  const extra = fallbackTenantIds.filter(
    (id, i, all) => id !== table.tenant_id && all.indexOf(id) === i,
  );
  for (const tenantId of extra) {
    const key = await newest(tenantId);
    if (key) return key;
  }
  return null;
}

export type GoogleEnv = {
  developerToken: string;
  clientId: string;
  clientSecret: string;
};

/**
 * Google Ads credentials for a table, resolved like sync-google-ads-data. A stale
 * access token is refreshed in memory only: the reconcile worker never writes to
 * tenant_integrations (the sync owns that, including needs_reauth).
 */
export async function resolveGoogleAuth(
  db: Db,
  table: ReconcileTable,
  env: GoogleEnv,
  budget: CallBudget,
  fetchFn: typeof fetch = fetch,
): Promise<GoogleAuth> {
  const settings = table.integration_settings || {};
  const source = String(settings.data_source || "direct_api");
  if (source === "make_api" || source === "webhook")
    throw new ReconcileSourceError(
      "config",
      `table is filled by ${source}, not the Google Ads API`,
    );
  const customerId = googleCustomerId(settings.customer_id);
  if (!customerId)
    throw new ReconcileSourceError(
      "config",
      "no Google Ads customer on the table",
    );
  if (!env.developerToken)
    throw new ReconcileSourceError(
      "config",
      "GOOGLE_ADS_DEVELOPER_TOKEN is not set",
    );

  let integration: Record<string, any> | null = null;
  const pinned = settings.integrationId || settings.integration_id;
  if (pinned) {
    const { data } = await db
      .from("tenant_integrations")
      .select("id, api_key, is_active, settings")
      .eq("id", pinned)
      .eq("integration_type", "google_ads")
      .maybeSingle();
    if (data?.is_active && data?.api_key) integration = data;
  }
  if (!integration) {
    const tenants = [
      table.tenant_id,
      ...(await agencySourceTenants(db, table.tenant_id)),
    ];
    const { data } = await db
      .from("tenant_integrations")
      .select("id, api_key, is_active, settings")
      .in("tenant_id", [...new Set(tenants)])
      .eq("integration_type", "google_ads")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });
    const usable = (data || []).filter((i: any) => i?.api_key);
    integration =
      usable.find((i: any) => !i.settings?.needs_reauth) || usable[0] || null;
  }
  if (!integration)
    throw new ReconcileSourceError("auth", "no active Google Ads connection");

  let accessToken = String(integration.api_key);
  const s = integration.settings || {};
  const expiresAt = s.expires_at ? Date.parse(s.expires_at) : 0;
  if (s.refresh_token && (!expiresAt || expiresAt < Date.now() + 5 * 60_000)) {
    budget.take();
    let body: any = null;
    let ok = false;
    try {
      const res = await fetchFn("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.clientId,
          client_secret: env.clientSecret,
          refresh_token: String(s.refresh_token),
          grant_type: "refresh_token",
        }),
        signal: requestTimeout(),
      });
      body = await res.json().catch(() => null);
      ok = res.ok && !!body?.access_token;
    } catch (err) {
      throw new ReconcileSourceError(
        "platform",
        `Google token refresh failed: ${err instanceof Error ? err.message : err}`,
      );
    }
    if (!ok)
      throw new ReconcileSourceError(
        "auth",
        `Google token refresh failed: ${body?.error || "unknown"}`,
      );
    accessToken = body.access_token;
  }
  return {
    accessToken,
    developerToken: env.developerToken,
    loginCustomerId: googleCustomerId(settings.manager_id) || customerId,
  };
}

// ── Runs and findings ──────────────────────────────────────────────────────

export type RunRecord = {
  tenant_id: string;
  table_id: string | null;
  client_id: string | null;
  platform: string | null;
  started_at: string;
  finished_at: string;
  status: RunStatus;
  window_start: string | null;
  window_end: string | null;
  summary: Record<string, unknown>;
};

/** Insert a finished run and its findings; returns the run id. */
export async function saveReconcileRun(
  db: Db,
  run: RunRecord,
  findings: ReconcileFinding[],
): Promise<string> {
  const { data, error } = await db
    .from("reconcile_runs")
    .insert(run)
    .select("id")
    .single();
  if (error) throw new Error(`reconcile_runs: ${error.message}`);
  const runId = data.id as string;
  const rows = findings.map((f) => ({
    run_id: runId,
    tenant_id: run.tenant_id,
    client_id: run.client_id,
    table_id: run.table_id,
    campaign_id: f.campaign_id,
    date: f.date,
    kind: f.kind,
    metric: f.metric,
    aios_value: f.aios_value,
    platform_value: f.platform_value,
    details: f.details,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: findErr } = await db
      .from("reconcile_findings")
      .insert(rows.slice(i, i + 500));
    if (findErr) throw new Error(`reconcile_findings: ${findErr.message}`);
  }
  return runId;
}

export async function latestRunForTable(
  db: Db,
  tableId: string,
): Promise<{
  status: string;
  started_at: string;
  summary: Record<string, unknown>;
} | null> {
  const { data } = await db
    .from("reconcile_runs")
    .select("status, started_at, summary")
    .eq("table_id", tableId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/** Drop runs (and, by cascade, their findings) older than `beforeIso`. */
export async function pruneReconcileRuns(db: Db, beforeIso: string) {
  const { error } = await db
    .from("reconcile_runs")
    .delete()
    .lt("started_at", beforeIso);
  if (error) console.warn("[reconcile] prune failed:", error.message);
}

// ── Unmapped Meta accounts ─────────────────────────────────────────────────

/** Every Meta ad account mapped to a report table or a client, as act_<id>. */
export async function listMappedMetaAccounts(db: Db): Promise<Set<string>> {
  const mapped = new Set<string>();
  const norm = (raw: unknown) => {
    const id = String(raw || "")
      .trim()
      .replace(/^act_/, "");
    return id ? `act_${id}` : null;
  };
  for (let from = 0; ; from += CRM_RECORDS_PAGE_SIZE) {
    const { data, error } = await db
      .from("crm_tables")
      .select("id, integration_settings")
      .in("integration_type", ["facebook_insights", "facebook_ecommerce"])
      .order("id", { ascending: true })
      .range(from, from + CRM_RECORDS_PAGE_SIZE - 1);
    if (error) throw new Error(`crm_tables: ${error.message}`);
    for (const t of data || []) {
      const id = norm(t.integration_settings?.ad_account_id);
      if (id) mapped.add(id);
    }
    if ((data || []).length < CRM_RECORDS_PAGE_SIZE) break;
  }
  for (let from = 0; ; from += CRM_RECORDS_PAGE_SIZE) {
    const { data, error } = await db
      .from("clients")
      .select("id, meta_ads_account_id")
      .not("meta_ads_account_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + CRM_RECORDS_PAGE_SIZE - 1);
    if (error) throw new Error(`clients: ${error.message}`);
    for (const c of data || []) {
      const id = norm(c.meta_ads_account_id);
      if (id) mapped.add(id);
    }
    if ((data || []).length < CRM_RECORDS_PAGE_SIZE) break;
  }
  return mapped;
}

export type TenantMetaConnections = {
  tenant_id: string;
  connections: Array<{ id: string; token: string }>;
};

/**
 * Org-level Meta connections only (connection_visibility 'org', or no owning
 * user). A staff member's private token can reach ad accounts of other
 * businesses they work for; those must never be listed to this tenant's owners.
 */
const ORG_CONNECTION_FILTER = "user_id.is.null,connection_visibility.eq.org";

const metaConnectionQuery = (db: Db, columns: string) =>
  db
    .from("tenant_integrations")
    .select(columns)
    .in("integration_type", META_TYPES)
    .eq("is_active", true)
    .not("api_key", "is", null)
    .or(ORG_CONNECTION_FILTER);

/**
 * The next tenant (in tenant_id order, after `afterTenantId`) with org-level
 * Meta connections holding their own token, with all of those connections (one
 * per distinct token). The unmapped-accounts check walks tenants one at a time,
 * so a tenant's run always covers every one of its connections and there is no
 * page cap that silently ends the walk. Null once there are no more tenants.
 */
export async function nextMetaConnectionTenant(
  db: Db,
  afterTenantId: string | null,
): Promise<TenantMetaConnections | null> {
  let q = metaConnectionQuery(db, "tenant_id");
  if (afterTenantId) q = q.gt("tenant_id", afterTenantId);
  const { data: next, error } = await q
    .order("tenant_id", { ascending: true })
    .limit(1);
  if (error) throw new Error(`tenant_integrations: ${error.message}`);
  const tenantId = next?.[0]?.tenant_id as string | undefined;
  if (!tenantId) return null;

  const seen = new Set<string>();
  const connections: TenantMetaConnections["connections"] = [];
  for (let from = 0; ; from += CRM_RECORDS_PAGE_SIZE) {
    const { data, error: rowsErr } = await metaConnectionQuery(
      db,
      "id, api_key",
    )
      .eq("tenant_id", tenantId)
      .order("id", { ascending: true })
      .range(from, from + CRM_RECORDS_PAGE_SIZE - 1);
    if (rowsErr) throw new Error(`tenant_integrations: ${rowsErr.message}`);
    for (const row of data || []) {
      if (!row.api_key || seen.has(row.api_key)) continue;
      seen.add(row.api_key);
      connections.push({ id: row.id, token: row.api_key });
    }
    if ((data || []).length < CRM_RECORDS_PAGE_SIZE) break;
  }
  return { tenant_id: tenantId, connections };
}

// ── Status for Carmen and the report page ──────────────────────────────────

const STATUS_RUN_COLUMNS =
  "id, tenant_id, client_id, table_id, platform, status, started_at, finished_at, window_start, window_end, summary, crm_tables(name), clients(name)";

/** Roles that may see tenant-level rows (unmapped ad accounts), as RLS allows. */
const TENANT_LEVEL_ROLES = ["owner", "super_admin"];

export type ReconcileStatusScope = {
  /** The caller's own tenant: every table run in it is in scope. */
  ownTenantId: string;
  /** Tenant-level runs (table_id NULL) of the own tenant: owners and super admins only. */
  includeTenantLevel: boolean;
  /** Clients of the agencies other tenants share with this one (agency_tenant_access). */
  sharedClientIds: string[];
};

/**
 * What get_reconciliation_status may show, mirroring the reconcile_runs read
 * policy (which follows crm_tables): all report tables of the caller's tenant,
 * and in a source tenant only the clients of the agency it shares, never that
 * tenant's other agencies or its tenant-level rows.
 */
export async function reconcileStatusScope(
  db: Db,
  opts: { tenantId: string; callerRole?: string | null },
): Promise<ReconcileStatusScope> {
  const { data: shares, error } = await db
    .from("agency_tenant_access")
    .select("source_tenant_id, agency_id")
    .eq("accessing_tenant_id", opts.tenantId);
  if (error) throw new Error(`agency_tenant_access: ${error.message}`);
  const agenciesBySource = new Map<string, Set<string>>();
  for (const share of shares || []) {
    const source = share?.source_tenant_id as string | null;
    const agency = share?.agency_id as string | null;
    if (!source || !agency || source === opts.tenantId) continue;
    const set = agenciesBySource.get(source) || new Set<string>();
    set.add(agency);
    agenciesBySource.set(source, set);
  }
  const sharedClientIds: string[] = [];
  for (const [source, agencies] of agenciesBySource) {
    for (let from = 0; ; from += CRM_RECORDS_PAGE_SIZE) {
      const { data, error: clientsErr } = await db
        .from("clients")
        .select("id")
        .eq("tenant_id", source)
        .in("agency_id", [...agencies])
        .order("id", { ascending: true })
        .range(from, from + CRM_RECORDS_PAGE_SIZE - 1);
      if (clientsErr) throw new Error(`clients: ${clientsErr.message}`);
      for (const c of data || []) if (c?.id) sharedClientIds.push(c.id);
      if ((data || []).length < CRM_RECORDS_PAGE_SIZE) break;
    }
  }
  return {
    ownTenantId: opts.tenantId,
    includeTenantLevel: TENANT_LEVEL_ROLES.includes(String(opts.callerRole)),
    sharedClientIds,
  };
}

/** True when `clientId` is the caller's own tenant's client or a shared-agency client. */
async function clientInScope(
  db: Db,
  scope: ReconcileStatusScope,
  clientId: string,
): Promise<boolean> {
  if (scope.sharedClientIds.includes(clientId)) return true;
  const { data } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", scope.ownTenantId)
    .maybeSingle();
  return !!data;
}

const STATUS_RUN_LIMIT = 2000;
const CLIENT_ID_CHUNK = 150;

/** Runs since `sinceIso` the scope allows, newest first. */
async function scopedRuns(
  db: Db,
  scope: ReconcileStatusScope,
  clientId: string | null,
  sinceIso: string,
): Promise<Array<Record<string, any>>> {
  const base = () =>
    db
      .from("reconcile_runs")
      .select(STATUS_RUN_COLUMNS)
      .gte("started_at", sinceIso);
  const run = async (q: any) => {
    const { data, error } = await q
      .order("started_at", { ascending: false })
      .limit(STATUS_RUN_LIMIT);
    if (error) throw new Error(`reconcile_runs: ${error.message}`);
    return (data || []) as Array<Record<string, any>>;
  };
  let runs: Array<Record<string, any>>;
  if (clientId) {
    runs = await run(
      base().eq("client_id", clientId).not("table_id", "is", null),
    );
  } else {
    let own = base().eq("tenant_id", scope.ownTenantId);
    if (!scope.includeTenantLevel) own = own.not("table_id", "is", null);
    runs = await run(own);
    for (let i = 0; i < scope.sharedClientIds.length; i += CLIENT_ID_CHUNK) {
      runs = runs.concat(
        await run(
          base()
            .in(
              "client_id",
              scope.sharedClientIds.slice(i, i + CLIENT_ID_CHUNK),
            )
            .not("table_id", "is", null),
        ),
      );
    }
  }
  const seen = new Set<string>();
  return runs
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

/**
 * Latest run per table (and per tenant for the unmapped-accounts check) since
 * `sinceIso`, limited to what the caller may see (see reconcileStatusScope).
 * The top findings come from the run summary (top_findings), so one query per
 * scope part answers it. Callers use a service-role client, so this scoping is
 * the access check.
 */
export async function getReconciliationStatus(
  db: Db,
  opts: {
    tenantId: string;
    callerRole?: string | null;
    clientId?: string | null;
    sinceIso: string;
  },
) {
  const scope = await reconcileStatusScope(db, opts);
  if (opts.clientId && !(await clientInScope(db, scope, opts.clientId)))
    throw new Error("הלקוח לא נמצא או מחוץ להרשאה שלך");
  const runs = await scopedRuns(
    db,
    scope,
    opts.clientId || null,
    opts.sinceIso,
  );
  const latest = new Map<string, Record<string, any>>();
  for (const run of runs) {
    const key = run.table_id || `tenant:${run.tenant_id}:${run.platform}`;
    if (!latest.has(key)) latest.set(key, run);
  }
  const kept = [...latest.values()];
  const rank = (s: string) =>
    s === "mismatch" ? 0 : s === "failed" ? 1 : s === "skipped" ? 3 : 2;
  const items = kept
    .map((run) => {
      const summary = run.summary || {};
      return {
        client: run.clients?.name || null,
        client_id: run.client_id,
        table: run.crm_tables?.name || null,
        table_id: run.table_id,
        platform: run.platform,
        status: run.status,
        checked_at: run.finished_at || run.started_at,
        window: run.window_start
          ? `${run.window_start} – ${run.window_end}`
          : null,
        counts: summary.counts || null,
        findings_total: summary.findings_total ?? null,
        persisting: summary.persisting || undefined,
        error: summary.error || summary.skipped_reason || null,
        top_findings: summary.top_findings || [],
      };
    })
    .sort((a, b) => rank(a.status) - rank(b.status));
  const count = (status: string) =>
    items.filter((i) => i.status === status).length;
  return {
    since: opts.sinceIso,
    last_run_at: kept[0]?.started_at || null,
    checked: items.length,
    ok: count("ok"),
    with_gaps: count("mismatch"),
    failed: count("failed"),
    skipped: count("skipped"),
    items,
  };
}
