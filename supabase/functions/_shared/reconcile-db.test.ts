import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  getReconciliationStatus,
  nextMetaConnectionTenant,
  readAiosCampaignRows,
  resolveMetaToken,
  saveReconcileRun,
} from "./reconcile-db.ts";
import { memoryDb } from "./reconcile-memory-db.ts";

type Call = { method: string; args: unknown[] };

/** Minimal PostgREST-style builder: records calls and answers `range` from `pages`. */
function fakeDb(handlers: {
  pages?: Array<Array<Record<string, unknown>>>;
  rows?: Array<Record<string, unknown>>;
  inserts?: Array<{ table: string; rows: unknown }>;
}) {
  const calls: Call[] = [];
  let pageIndex = 0;
  const db = {
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      const builder: Record<string, unknown> = {};
      const chain =
        (method: string) =>
        (...args: unknown[]) => {
          calls.push({ method, args });
          return builder;
        };
      for (const m of [
        "select",
        "eq",
        "gte",
        "lte",
        "gt",
        "in",
        "or",
        "order",
        "limit",
        "not",
      ])
        builder[m] = chain(m);
      builder.range = (...args: unknown[]) => {
        calls.push({ method: "range", args });
        const data = handlers.pages?.[pageIndex++] || [];
        return Promise.resolve({ data, error: null });
      };
      builder.insert = (rows: unknown) => {
        handlers.inserts?.push({ table, rows });
        const result = Promise.resolve({ error: null }) as Promise<{
          error: null;
        }> &
          Record<string, unknown>;
        result.select = () => ({
          single: () => Promise.resolve({ data: { id: "run-1" }, error: null }),
        });
        return result;
      };
      builder.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: handlers.rows || [], error: null });
      return builder;
    },
  };
  return { db, calls };
}

const rec = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `r${i}`,
  data: {
    date: "2026-10-20",
    campaign_id: String(i),
    campaign_name: `C${i}`,
    spend: 1,
    ...extra,
  },
});

Deno.test(
  "stored rows are read page by page until a short page; legacy rows count as campaign",
  async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => rec(i));
    const page2 = [
      rec(3),
      rec(4, { entity_level: "campaign" }),
      // The filter should have kept these out; they are dropped if they slip through.
      rec(5, { entity_level: "ad" }),
    ];
    const page3 = [rec(6)];
    const { db, calls } = fakeDb({ pages: [page1, page2, page3] });
    const rows = await readAiosCampaignRows(
      db,
      "table-1",
      "2026-10-19",
      "2026-10-25",
      3,
    );
    assertEquals(
      rows.map((r) => r.campaign_id),
      ["0", "1", "2", "3", "4", "6"],
    );
    assertEquals(
      calls.filter((c) => c.method === "range").map((c) => c.args),
      [
        [0, 2],
        [3, 5],
        [6, 8],
      ],
    );
    const or = calls.find((c) => c.method === "or");
    assertEquals(or?.args, [
      "data->>entity_level.is.null,data->>entity_level.eq.campaign",
    ]);
    const order = calls.find((c) => c.method === "order");
    assertEquals(order?.args, ["id", { ascending: true }]);
  },
);

Deno.test("a run and its findings are stored together", async () => {
  const inserts: Array<{ table: string; rows: unknown }> = [];
  const { db } = fakeDb({ inserts });
  const id = await saveReconcileRun(
    db,
    {
      tenant_id: "tenant-1",
      table_id: "table-1",
      client_id: "client-1",
      platform: "meta",
      started_at: "2026-10-26T01:30:00Z",
      finished_at: "2026-10-26T01:30:05Z",
      status: "mismatch",
      window_start: "2026-10-19",
      window_end: "2026-10-25",
      summary: {},
    },
    [
      {
        kind: "missing_day",
        campaign_id: null,
        date: "2026-10-21",
        metric: "spend",
        aios_value: 0,
        platform_value: 300,
        details: {},
      },
    ],
  );
  assertStrictEquals(id, "run-1");
  assertEquals(
    inserts.map((i) => i.table),
    ["reconcile_runs", "reconcile_findings"],
  );
  const finding = (inserts[1].rows as Array<Record<string, unknown>>)[0];
  assertEquals(
    [finding.run_id, finding.tenant_id, finding.table_id, finding.kind],
    ["run-1", "tenant-1", "table-1", "missing_day"],
  );
});

Deno.test(
  "status keeps the latest run per table and puts gaps first",
  async () => {
    const run = (
      id: string,
      table_id: string | null,
      status: string,
      started_at: string,
    ) => ({
      id,
      tenant_id: "tenant-1",
      client_id: "client-1",
      table_id,
      platform: "meta",
      status,
      started_at,
      finished_at: started_at,
      window_start: "2026-10-19",
      window_end: "2026-10-24",
      summary:
        status === "mismatch"
          ? {
              counts: { mismatch: 2 },
              findings_total: 2,
              top_findings: [{ kind: "mismatch", campaign: "A" }],
            }
          : {},
      crm_tables: { name: `table ${table_id}` },
      clients: { name: "Client" },
    });
    const db = memoryDb({
      reconcile_runs: [
        run("3", "t1", "ok", "2026-10-26T01:31:00Z"),
        run("2", "t2", "mismatch", "2026-10-26T01:30:30Z"),
        run("1", "t1", "mismatch", "2026-10-25T01:30:00Z"),
      ],
    });
    const status = await getReconciliationStatus(db, {
      tenantId: "tenant-1",
      callerRole: "owner",
      sinceIso: "2026-10-23T00:00:00Z",
    });
    assertStrictEquals(status.checked, 2);
    assertStrictEquals(status.ok, 1);
    assertStrictEquals(status.with_gaps, 1);
    assertEquals(
      status.items.map((i) => [i.table_id, i.status]),
      [
        ["t2", "mismatch"],
        ["t1", "ok"],
      ],
    );
    assertEquals(status.items[0].top_findings, [
      { kind: "mismatch", campaign: "A" },
    ]);
  },
);

// Tenant A shares agency X with tenant B (agency_tenant_access). B also has
// agency Y, which A has no access to, and B's own account-level check.
function sharedTenantsDb() {
  const run = (
    id: string,
    tenant_id: string,
    client_id: string | null,
    table_id: string | null,
  ) => ({
    id,
    tenant_id,
    client_id,
    table_id,
    platform: "meta",
    status: "mismatch",
    started_at: "2026-10-26T01:30:00Z",
    finished_at: "2026-10-26T01:30:05Z",
    window_start: table_id ? "2026-10-19" : null,
    window_end: table_id ? "2026-10-24" : null,
    summary: {
      findings_total: 1,
      top_findings: [{ kind: "mismatch", campaign: `campaign of ${id}` }],
    },
    crm_tables: table_id ? { name: table_id } : null,
    clients: client_id ? { name: client_id } : null,
  });
  return memoryDb({
    agency_tenant_access: [
      {
        accessing_tenant_id: "tenant-A",
        source_tenant_id: "tenant-B",
        agency_id: "agency-X",
      },
    ],
    clients: [
      { id: "client-a", tenant_id: "tenant-A", agency_id: "agency-A" },
      { id: "client-bx", tenant_id: "tenant-B", agency_id: "agency-X" },
      { id: "client-by", tenant_id: "tenant-B", agency_id: "agency-Y" },
    ],
    reconcile_runs: [
      run("a-table", "tenant-A", "client-a", "table-a"),
      run("a-accounts", "tenant-A", null, null),
      run("bx-table", "tenant-B", "client-bx", "table-bx"),
      run("by-table", "tenant-B", "client-by", "table-by"),
      run("b-accounts", "tenant-B", null, null),
    ],
  });
}

const SINCE = "2026-10-23T00:00:00Z";
const ids = (status: {
  items: Array<{ table_id: string | null; client_id: string | null }>;
}) => status.items.map((i) => i.table_id || `accounts:${i.client_id}`).sort();

Deno.test(
  "status scope: a manager sees own tables and the shared agency's clients only",
  async () => {
    const status = await getReconciliationStatus(sharedTenantsDb(), {
      tenantId: "tenant-A",
      callerRole: "agency_manager",
      sinceIso: SINCE,
    });
    // Not B's other agency, not B's account-level run, and A's own
    // account-level run is for owners only.
    assertEquals(ids(status), ["table-a", "table-bx"]);
  },
);

Deno.test(
  "status scope: an owner also sees the own tenant's unmapped-account run, never the source tenant's",
  async () => {
    const status = await getReconciliationStatus(sharedTenantsDb(), {
      tenantId: "tenant-A",
      callerRole: "owner",
      sinceIso: SINCE,
    });
    assertEquals(ids(status), ["accounts:null", "table-a", "table-bx"]);
    const accounts = status.items.find((i) => !i.table_id);
    assertEquals(accounts?.top_findings, [
      { kind: "mismatch", campaign: "campaign of a-accounts" },
    ]);
  },
);

Deno.test(
  "status scope: a client of a non-shared agency in the source tenant is refused",
  async () => {
    const db = sharedTenantsDb();
    await assertRejects(
      () =>
        getReconciliationStatus(db, {
          tenantId: "tenant-A",
          callerRole: "owner",
          clientId: "client-by",
          sinceIso: SINCE,
        }),
      Error,
      "מחוץ להרשאה",
    );
    const shared = await getReconciliationStatus(db, {
      tenantId: "tenant-A",
      callerRole: "agency_manager",
      clientId: "client-bx",
      sinceIso: SINCE,
    });
    assertEquals(ids(shared), ["table-bx"]);
  },
);

Deno.test(
  "Meta token: the table's own tenant only, never an agency source tenant's",
  async () => {
    const db = memoryDb({
      agency_tenant_access: [
        { accessing_tenant_id: "tenant-A", source_tenant_id: "tenant-B" },
      ],
      tenant_integrations: [
        {
          id: "b-conn",
          tenant_id: "tenant-B",
          integration_type: "facebook",
          is_active: true,
          connection_visibility: "org",
          api_key: "token-of-B",
          updated_at: "2026-10-25T00:00:00Z",
        },
      ],
    });
    const table = {
      id: "t1",
      tenant_id: "tenant-A",
      client_id: "c1",
      integration_type: "facebook_insights",
      integration_settings: { ad_account_id: "act_1" },
    };
    // Same as sync-facebook-insights: no token on tenant A means no token.
    assertStrictEquals(await resolveMetaToken(db, table), null);
    // Carmen's live check may still pass the caller's tenant explicitly.
    assertStrictEquals(
      await resolveMetaToken(db, table, ["tenant-B"]),
      "token-of-B",
    );
  },
);

Deno.test(
  "unmapped accounts: tenants one at a time, org-level connections only, no page cap",
  async () => {
    const conn = (
      id: string,
      tenant_id: string,
      extra: Record<string, unknown> = {},
    ) => ({
      id,
      tenant_id,
      integration_type: "facebook",
      is_active: true,
      api_key: `token-${id}`,
      user_id: "user-1",
      connection_visibility: "org",
      ...extra,
    });
    const rows = [
      conn("c1", "tenant-1"),
      conn("c2", "tenant-1", {
        user_id: null,
        connection_visibility: "private",
      }),
      // A staff member's personal token: never listed to the owners.
      conn("c3", "tenant-1", { connection_visibility: "private" }),
      // Same token twice in one tenant is one connection.
      conn("c4", "tenant-1", { api_key: "token-c1" }),
      conn("c5", "tenant-2", { is_active: false }),
      conn("c6", "tenant-3", { api_key: null }),
    ];
    // More connections than any single page: all of tenant-4's are returned.
    for (let i = 0; i < 1005; i++)
      rows.push(conn(`d${String(i).padStart(4, "0")}`, "tenant-4"));
    const db = memoryDb({ tenant_integrations: rows });

    const first = await nextMetaConnectionTenant(db, null);
    assertStrictEquals(first?.tenant_id, "tenant-1");
    assertEquals(
      first?.connections.map((c) => c.id),
      ["c1", "c2"],
    );
    const second = await nextMetaConnectionTenant(db, "tenant-1");
    assertStrictEquals(second?.tenant_id, "tenant-4");
    assertStrictEquals(second?.connections.length, 1005);
    assertStrictEquals(await nextMetaConnectionTenant(db, "tenant-4"), null);
  },
);
