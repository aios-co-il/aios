import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { memoryDb } from "../_shared/reconcile/memory-db.ts";
import { nextMetaConnectionTenant } from "./unmapped-accounts-db.ts";

/** An active org-level Meta connection with its own token. */
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

describe("nextMetaConnectionTenant", () => {
  it("walks tenants one at a time, org-level connections only, with no page cap", async () => {
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
    for (let i = 0; i < 1005; i++) {
      rows.push(conn(`d${String(i).padStart(4, "0")}`, "tenant-4"));
    }
    // Only a staff member's private token: listed with no connections, so the
    // check can record that it had nothing it may read.
    rows.push(conn("e1", "tenant-5", { connection_visibility: "private" }));
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
    assertEquals(await nextMetaConnectionTenant(db, "tenant-4"), {
      tenant_id: "tenant-5",
      connections: [],
    });
    assertStrictEquals(await nextMetaConnectionTenant(db, "tenant-5"), null);
  });
});
