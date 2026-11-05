import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { memoryDb } from "../_shared/reconcile/memory-db.ts";
import { getReconciliationStatus } from "./reconciliation-status.ts";
import { rolesInTenant } from "./status-scope.ts";

const SINCE = "2026-10-23T00:00:00Z";

/** A mismatch run of tenant_id; a tenant-level run when table_id is null. */
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

/**
 * Tenant A shares agency X with tenant B (agency_tenant_access). B also has
 * agency Y, which A has no access to, and B's own account-level check.
 */
function sharedTenantsDb() {
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

/** The status lines as table ids, or accounts:<client> for tenant-level runs. */
const ids = (status: {
  items: Array<{ table_id: string | null; client_id: string | null }>;
}) => status.items.map((i) => i.table_id || `accounts:${i.client_id}`).sort();

describe("reconcileStatusScope", () => {
  it("lets a manager see own tables and the shared agency's clients only", async () => {
    const status = await getReconciliationStatus(sharedTenantsDb(), {
      tenantId: "tenant-A",
      callerRoles: ["agency_manager"],
      sinceIso: SINCE,
    });
    // Not B's other agency, not B's account-level run, and A's own
    // account-level run is for owners only.
    assertEquals(ids(status), ["table-a", "table-bx"]);
  });

  it("lets an owner also see the own tenant's unmapped-account run, never the source tenant's", async () => {
    const status = await getReconciliationStatus(sharedTenantsDb(), {
      tenantId: "tenant-A",
      callerRoles: ["owner"],
      sinceIso: SINCE,
    });
    assertEquals(ids(status), ["accounts:null", "table-a", "table-bx"]);
    const accounts = status.items.find((i) => !i.table_id);
    assertEquals(accounts?.top_findings, [
      { kind: "mismatch", campaign: "campaign of a-accounts" },
    ]);
  });

  it("refuses a client of a non-shared agency in the source tenant", async () => {
    const db = sharedTenantsDb();
    await assertRejects(
      () =>
        getReconciliationStatus(db, {
          tenantId: "tenant-A",
          callerRoles: ["owner"],
          clientId: "client-by",
          sinceIso: SINCE,
        }),
      Error,
      "מחוץ להרשאה",
    );
    const shared = await getReconciliationStatus(db, {
      tenantId: "tenant-A",
      callerRoles: ["agency_manager"],
      clientId: "client-bx",
      sinceIso: SINCE,
    });
    assertEquals(ids(shared), ["table-bx"]);
  });
});

describe("rolesInTenant", () => {
  it("reads this tenant's and global roles, filtering the tenant in the database", async () => {
    const db = memoryDb({
      user_roles: [
        { user_id: "user-1", tenant_id: "tenant-2", role: "owner" },
        { user_id: "user-1", tenant_id: "tenant-1", role: "campaigner" },
        { user_id: "user-1", tenant_id: null, role: "super_admin" },
        { user_id: "user-2", tenant_id: "tenant-1", role: "owner" },
      ],
    });
    const roles = await rolesInTenant(db, "tenant-1", "user-1");
    assertEquals(roles.sort(), ["campaigner", "super_admin"]);
    // No user_id-only read: each query carries a tenant filter.
    assertEquals(
      db.queries.map((q) => [q.table, ...q.filters]),
      [
        ["user_roles", "eq user_id", "eq tenant_id"],
        ["user_roles", "eq user_id", "is tenant_id null"],
      ],
    );
  });

  it("throws when user_roles cannot be read", async () => {
    const db = memoryDb({}, { user_roles: "permission denied" });
    await assertRejects(
      () => rolesInTenant(db, "tenant-1", "user-1"),
      Error,
      "user_roles: permission denied",
    );
  });
});
