import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import type { PublishAccessLookups } from "../_shared/tenant-publish-access.ts";
import {
  authorizePostPublisher,
  type PostToPublish,
} from "./publish-access.ts";

const TENANT = "tenant-a";
const SITE_URL = "https://client-1.example";
const WORDPRESS_POST: PostToPublish = {
  tenant_id: TENANT,
  publish_to_wordpress: true,
  wordpress_site_url: SITE_URL,
};

/** A service-role client whose social_media_wordpress_sites query returns
 * `sites`, recording its filters. */
function fakeDb(sites: unknown[], error: unknown = null) {
  const filters: Array<[string, unknown]> = [];
  const tables: string[] = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    then: (resolve: (result: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: error ? null : sites, error }).then(resolve),
  };
  return {
    filters,
    tables,
    db: {
      from: (table: string) => {
        tables.push(table);
        return query;
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
}

/** Tenant-a members, of whom only "with-access" can access client-1. */
function fakeLookups(): PublishAccessLookups & { clientChecks: string[] } {
  const clientChecks: string[] = [];
  return {
    clientChecks,
    isTenantMember: (_userId, tenantId) => Promise.resolve(tenantId === TENANT),
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

describe("authorizePostPublisher", () => {
  it("allows a member with access to the WordPress site's client", async () => {
    const { db, filters, tables } = fakeDb([{ client_id: "client-1" }]);
    const lookups = fakeLookups();
    const decision = await authorizePostPublisher(
      db,
      user("with-access"),
      WORDPRESS_POST,
      lookups,
    );
    assertEquals(decision, { allowed: true });
    assertEquals(tables, ["social_media_wordpress_sites"]);
    assertEquals(filters, [
      ["tenant_id", TENANT],
      ["site_url", SITE_URL],
      ["is_active", true],
    ]);
    assertEquals(lookups.clientChecks, ["client-1"]);
  });

  it("refuses a member without access to the WordPress site's client", async () => {
    const { db } = fakeDb([{ client_id: "client-1" }]);
    const decision = await authorizePostPublisher(
      db,
      user("no-access"),
      WORDPRESS_POST,
      fakeLookups(),
    );
    assertEquals(decision, {
      allowed: false,
      status: 403,
      error: "No access to this client",
    });
  });

  it("checks only the tenant for a site without a client", async () => {
    const { db } = fakeDb([{ client_id: null }]);
    const lookups = fakeLookups();
    const decision = await authorizePostPublisher(
      db,
      user("no-access"),
      WORDPRESS_POST,
      lookups,
    );
    assertEquals(decision, { allowed: true });
    assertEquals(lookups.clientChecks, []);
  });

  it("checks only the tenant for a post that skips WordPress", async () => {
    const { db, tables } = fakeDb([{ client_id: "client-1" }]);
    const decision = await authorizePostPublisher(
      db,
      user("no-access"),
      { ...WORDPRESS_POST, publish_to_wordpress: false },
      fakeLookups(),
    );
    assertEquals(decision, { allowed: true });
    assertEquals(tables, []);
  });

  it("lets the service role publish without looking up the site", async () => {
    const { db, tables } = fakeDb([{ client_id: "client-1" }]);
    const decision = await authorizePostPublisher(
      db,
      { kind: "service", userId: null },
      WORDPRESS_POST,
      fakeLookups(),
    );
    assertEquals(decision, { allowed: true });
    assertEquals(tables, []);
  });

  it("refuses a user outside the post's tenant", async () => {
    const { db } = fakeDb([]);
    const decision = await authorizePostPublisher(
      db,
      user("with-access"),
      { ...WORDPRESS_POST, tenant_id: "tenant-b" },
      fakeLookups(),
    );
    assertEquals(decision, {
      allowed: false,
      status: 403,
      error: "Not a member of this tenant",
    });
  });

  it("throws when the site lookup fails instead of allowing", async () => {
    const { db } = fakeDb([], new Error("db down"));
    await assertRejects(
      () =>
        authorizePostPublisher(
          db,
          user("with-access"),
          WORDPRESS_POST,
          fakeLookups(),
        ),
      Error,
      "db down",
    );
  });
});
