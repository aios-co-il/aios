import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import type { PublishAccessLookups } from "../_shared/tenant-publish-access.ts";
import {
  authorizeUserPublishTarget,
  splitByClientAccess,
} from "./publish-target.ts";

const TENANT = "tenant-a";
const ENTRY = { tenant_id: TENANT, client_id: "client-1" };

/** A service-role client whose tables hold at most one row each. */
function fakeDb(rows: Record<string, unknown>, error: unknown = null) {
  const queries: Array<{ table: string; columns: string; id: unknown }> = [];
  return {
    queries,
    db: {
      from: (table: string) => ({
        select: (columns: string) => ({
          eq: (_column: string, id: unknown) => ({
            maybeSingle: () => {
              queries.push({ table, columns, id });
              return Promise.resolve({ data: rows[table] ?? null, error });
            },
          }),
        }),
      }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
}

/** Tenant-a members, of whom only "with-access" can access client-1. */
function fakeLookups(): PublishAccessLookups & { clientChecks: string[] } {
  const clientChecks: string[] = [];
  return {
    clientChecks,
    isTenantMember: (userId, tenantId) =>
      Promise.resolve(tenantId === TENANT && userId !== "outsider"),
    isSuperAdmin: () => Promise.resolve(false),
    canAccessClient: (userId, clientId) => {
      clientChecks.push(clientId);
      return Promise.resolve(
        userId === "with-access" && clientId === "client-1",
      );
    },
  };
}

const user = (userId: string) => ({ kind: "user" as const, userId });

describe("authorizeUserPublishTarget", () => {
  it("allows a member with access to the entry's client", async () => {
    const { db, queries } = fakeDb({ seo_geo_calendar_entries: ENTRY });
    const lookups = fakeLookups();
    const decision = await authorizeUserPublishTarget(
      db,
      user("with-access"),
      { entryId: "entry-1" },
      lookups,
    );
    assertEquals(decision, { allowed: true, tenantId: TENANT });
    assertEquals(queries, [
      {
        table: "seo_geo_calendar_entries",
        columns: "tenant_id,client_id",
        id: "entry-1",
      },
    ]);
    assertEquals(lookups.clientChecks, ["client-1"]);
  });

  it("refuses a member without access to the entry's client", async () => {
    const { db } = fakeDb({ seo_geo_calendar_entries: ENTRY });
    const decision = await authorizeUserPublishTarget(
      db,
      user("no-access"),
      { entryId: "entry-1" },
      fakeLookups(),
    );
    assertEquals(decision, {
      allowed: false,
      status: 403,
      error: "No access to this client",
    });
  });

  it("refuses a member without access to the work item's client", async () => {
    const { db, queries } = fakeDb({ marketing_work_items: ENTRY });
    const decision = await authorizeUserPublishTarget(
      db,
      user("no-access"),
      { workItemId: "item-1" },
      fakeLookups(),
    );
    assertEquals(decision, {
      allowed: false,
      status: 403,
      error: "No access to this client",
    });
    assertEquals(queries[0].table, "marketing_work_items");
    assertEquals(queries[0].columns, "tenant_id,client_id");
  });

  it("allows a member with access to the work item's client", async () => {
    const { db } = fakeDb({ marketing_work_items: ENTRY });
    const decision = await authorizeUserPublishTarget(
      db,
      user("with-access"),
      { workItemId: "item-1" },
      fakeLookups(),
    );
    assertEquals(decision, { allowed: true, tenantId: TENANT });
  });

  it("checks only the tenant for a work item without a client", async () => {
    const { db } = fakeDb({
      marketing_work_items: { tenant_id: TENANT, client_id: null },
    });
    const lookups = fakeLookups();
    const decision = await authorizeUserPublishTarget(
      db,
      user("no-access"),
      { workItemId: "item-1" },
      lookups,
    );
    assertEquals(decision, { allowed: true, tenantId: TENANT });
    assertEquals(lookups.clientChecks, []);
  });

  it("refuses a user outside the target's tenant", async () => {
    const { db } = fakeDb({ seo_geo_calendar_entries: ENTRY });
    const decision = await authorizeUserPublishTarget(
      db,
      user("outsider"),
      { entryId: "entry-1" },
      fakeLookups(),
    );
    assertEquals(decision, {
      allowed: false,
      status: 403,
      error: "Not a member of this tenant",
    });
  });

  it("answers 404 when the entry or work item does not exist", async () => {
    const { db } = fakeDb({});
    assertEquals(
      await authorizeUserPublishTarget(
        db,
        user("with-access"),
        { entryId: "missing" },
        fakeLookups(),
      ),
      { allowed: false, status: 404, error: "Entry not found" },
    );
    assertEquals(
      await authorizeUserPublishTarget(
        db,
        user("with-access"),
        { workItemId: "missing" },
        fakeLookups(),
      ),
      { allowed: false, status: 404, error: "Work item not found" },
    );
  });

  it("throws when the lookup fails instead of allowing", async () => {
    const { db } = fakeDb({}, new Error("db down"));
    await assertRejects(
      () =>
        authorizeUserPublishTarget(
          db,
          user("with-access"),
          { entryId: "entry-1" },
          fakeLookups(),
        ),
      Error,
      "db down",
    );
  });
});

describe("splitByClientAccess", () => {
  const due = (id: string, client_id: string | null) => ({
    id,
    tenant_id: TENANT,
    client_id,
  });

  it("refuses each entry of a client the user cannot access", async () => {
    const lookups = fakeLookups();
    const split = await splitByClientAccess(
      user("with-access"),
      [due("e1", "client-1"), due("e2", "client-2"), due("e3", "client-1")],
      lookups,
    );
    assertEquals(split, {
      publishable: [due("e1", "client-1"), due("e3", "client-1")],
      refused: [{ id: "e2", ok: false, error: "No access to this client" }],
    });
    assertEquals(lookups.clientChecks, ["client-1", "client-2"]);
  });

  it("a work item without a client does not cover its entries", async () => {
    const { db } = fakeDb({
      marketing_work_items: { tenant_id: TENANT, client_id: null },
    });
    const lookups = fakeLookups();
    const target = await authorizeUserPublishTarget(
      db,
      user("no-access"),
      { workItemId: "item-1" },
      lookups,
    );
    assertEquals(target, { allowed: true, tenantId: TENANT });
    const split = await splitByClientAccess(
      user("no-access"),
      [due("e1", "client-1"), due("e2", null)],
      lookups,
    );
    assertEquals(split, {
      publishable: [due("e2", null)],
      refused: [{ id: "e1", ok: false, error: "No access to this client" }],
    });
  });

  it("lets the service role publish every entry without lookups", async () => {
    const lookups = fakeLookups();
    const split = await splitByClientAccess(
      { kind: "service", userId: null },
      [due("e1", "client-2")],
      lookups,
    );
    assertEquals(split, { publishable: [due("e1", "client-2")], refused: [] });
    assertEquals(lookups.clientChecks, []);
  });

  it("throws when a lookup fails instead of allowing", async () => {
    const failing = {
      ...fakeLookups(),
      canAccessClient: () => Promise.reject(new Error("rpc down")),
    };
    await assertRejects(
      () =>
        splitByClientAccess(
          user("with-access"),
          [due("e1", "client-1")],
          failing,
        ),
      Error,
      "rpc down",
    );
  });
});
